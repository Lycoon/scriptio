import jwt from "jsonwebtoken";

import * as bc from "lib0/broadcastchannel";
import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";

import { getCollabHttpUrl } from "../utils/requests";

declare const window: any;

/**
 * This custom WebsocketProvider enables adaptive throttle depending on how many collaborators are currently
 * working on the project to save bandwidth. While updates are more sparse for a single-user, they are more
 * frequent during multi-user editing.
 */
export class ThrottledWebsocketProvider extends WebsocketProvider {
    private updateQueue: Uint8Array[] = [];
    private awarenessQueue: Set<number> = new Set();
    private flushInterval: ReturnType<typeof setInterval> | null = null;
    private lastFlushTime: number = 0; // Milliseconds (Date.now())
    private lastMessageTime: number = 0; // Milliseconds (Date.now())
    private userIdleTimer: ReturnType<typeof setTimeout> | null = null;

    // Throttling configuration (all in milliseconds)
    private readonly SOLO_USER_UPDATE_MS = 1000; // 1s when alone
    private readonly MULTI_USER_UPDATE_MS = 200; // 200ms with others
    private readonly MAX_SILENCE_DURATION_MS = 20000; // 20s max silence before ping
    private readonly MAX_IDLE_DURATION_MS = 10 * 60 * 1000; // 10 minutes idle timeout
    private readonly FLUSH_CHECK_INTERVAL_MS = 100; // Check flush every 100ms

    private readonly ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll"];

    // Reconnection state
    private reconnectAttempts: number = 0;
    private readonly MAX_RECONNECT_ATTEMPTS: number = 10;
    private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    private isDestroyed: boolean = false;

    // Track our own state
    private readonly localClientId: number;
    private isIdleDisconnected: boolean = false;
    private isSessionReplaced: boolean = false;
    private lastKnownUserCount: number = 1;

    // Store userInfo so we can restore it on reconnection
    private userInfo: { name: string; color: string; userId?: string } | null = null;

    // Close codes from server
    private readonly CLOSE_CODE_SESSION_REPLACED = 4001;
    private readonly CLOSE_CODE_DOCUMENT_RESTORED = 4005;

    // Bound event handlers for proper cleanup
    private boundResetIdleTimer: () => void;

    constructor(
        serverUrl: string,
        room: string,
        doc: Y.Doc,
        options: any & { userInfo?: { name: string; color: string; userId?: string } },
    ) {
        // Pass connect: false to prevent immediate connection
        // We'll connect after setting up user info
        super(serverUrl, room, doc, { ...options, connect: false });

        this.localClientId = doc.clientID;
        this.boundResetIdleTimer = this.resetUserIdleTimer.bind(this);
        this.lastFlushTime = Date.now();
        this.lastMessageTime = Date.now();

        // Store and set user info BEFORE connecting so awareness is correct from the start
        if (options.userInfo) {
            this.userInfo = options.userInfo;
            this.awareness.setLocalStateField("user", options.userInfo);
        }

        // Replace default handlers with throttled versions
        doc.off("update", (this as any)._updateHandler);
        doc.on("update", this.onThrottledUpdate);
        this.awareness.off("update", (this as any)._awarenessUpdateHandler);
        this.awareness.on("update", this.onThrottledAwareness);

        // Handle awareness query (message type 3 = messageQueryAwareness)
        // When the server requests awareness, immediately send our current state
        (this as any).messageHandlers[3] = (
            encoder: encoding.Encoder,
            _decoder: any,
            _provider: any,
            _emitSynced: any,
            _messageType: any,
        ) => {
            this.lastMessageTime = Date.now();
            // Write awareness update to the encoder (y-websocket will send it)
            encoding.writeVarUint(encoder, 1); // messageAwareness
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.localClientId]),
            );
        };

        // Handle ping responses (message type 9)
        // This prevents the default handler from treating it as unknown
        // and updates our message timestamp
        (this as any).messageHandlers[9] = () => {
            this.lastMessageTime = Date.now();
        };

        // Handle connection status changes
        this.on("status", this.onStatusChange);

        // Start background processes
        this.startFlushLoop();
        this.setupIdleListeners();

        // Hook into WebSocket close events to detect session replacement
        this.setupCloseHandler();

        console.log(`[WS] Provider initialized for room ${room}, clientId: ${this.localClientId}`);

        // Now connect after everything is set up (including user info)
        this.connect();
    }

    /**
     * Handle connection status changes
     */
    private onStatusChange = (event: { status: string }) => {
        if (event.status === "connected") {
            this.reconnectAttempts = 0;
            this.isIdleDisconnected = false;
            this.isSessionReplaced = false;
            this.lastMessageTime = Date.now();

            // Restore user info if it was lost during reconnection
            // y-websocket may clear awareness state internally during reconnect
            if (this.userInfo && !this.awareness.getLocalState()?.user) {
                this.awareness.setLocalStateField("user", this.userInfo);
            }

            // Queue and send our awareness update
            this.awarenessQueue.add(this.localClientId);
            this.flush();
        } else if (event.status === "disconnected") {
            this.lastKnownUserCount = 1;
        }
    };

    /**
     * Set up a hook to intercept WebSocket close events
     * y-websocket doesn't expose close codes, so we need to intercept
     */
    private setupCloseHandler(): void {
        const provider = this;
        let currentWs: WebSocket | null = null;

        const checkAndHookWs = () => {
            // Don't hook if session was already replaced
            if (provider.isSessionReplaced) return;

            const ws = (provider as any).ws;
            if (ws && ws !== currentWs) {
                currentWs = ws;
                const originalClose = ws.onclose;
                ws.onclose = (event: CloseEvent) => {
                    if (event.code === provider.CLOSE_CODE_SESSION_REPLACED) {
                        provider.handleSessionReplaced();
                        return;
                    }
                    if (event.code === provider.CLOSE_CODE_DOCUMENT_RESTORED) {
                        provider.handleDocumentRestored();
                        return;
                    }
                    if (originalClose) {
                        originalClose.call(ws, event);
                    }
                };
            }
        };

        // Hook into new WebSocket connections when status changes
        this.on("status", (event: { status: string }) => {
            // Only hook when connecting, not when already replaced
            if (event.status === "connecting" && !provider.isSessionReplaced) {
                setTimeout(checkAndHookWs, 0);
            }
        });

        // Initial check
        checkAndHookWs();
    }

    /**
     * Handle session replacement - stop all reconnection attempts
     */
    private handleSessionReplaced(): void {
        console.log("[WS] Session was replaced by another connection. Stopping reconnection.");
        this.isSessionReplaced = true;

        // Cancel any pending reconnects from our custom logic
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // Tell y-websocket to not reconnect
        this.shouldConnect = false;

        // Disconnect properly to clean up
        this.disconnect();

        // Emit custom event for UI to handle
        //this.emit("session-replaced", []);
    }

    /**
     * Handle document restore — the server replaced its doc with a snapshot.
     * Stop reconnecting and notify the consumer to clear local state and reload.
     */
    private handleDocumentRestored(): void {
        console.log("[WS] Document was restored. Notifying consumer to reload.");

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        this.shouldConnect = false;
        this.disconnect();
        this.emit("document-restored", []);
    }

    /**
     * Count active collaborators (excluding ourselves and stale states)
     * Only counts users who have set a 'user' field in their awareness state
     */
    private getActiveUserCount(): number {
        const states = this.awareness.getStates();
        let count = 0;

        states.forEach((state, clientId) => {
            // Only count if:
            // 1. It's not our own client
            // 2. The state has a 'user' field (indicating active collaboration)
            if (clientId !== this.localClientId && state && state.user) {
                count++;
            }
        });

        // Include ourselves in the count
        const totalCount = count + 1;

        // Log when user count changes
        if (totalCount !== this.lastKnownUserCount) {
            console.log(`[WS] Active user count changed: ${this.lastKnownUserCount} -> ${totalCount}`);
            this.lastKnownUserCount = totalCount;
        }

        return totalCount;
    }

    /**
     * Update the user info for awareness.
     * This stores the info and sets it on the awareness state.
     */
    public setUserInfo(userInfo: { name: string; color: string; userId?: string }): void {
        this.userInfo = userInfo;
        this.awareness.setLocalStateField("user", userInfo);
    }

    /**
     * Update the authentication token and reconnect.
     * This allows refreshing expired tokens without destroying the provider.
     */
    public async updateToken(newToken: string): Promise<void> {
        if (this.isDestroyed) {
            console.warn("[WS] Cannot update token on destroyed provider");
            return;
        }

        if (this.isSessionReplaced) {
            console.warn("[WS] Cannot update token - session was replaced");
            return;
        }

        console.log("[WS] Updating token and reconnecting...");

        // Snapshot current params so we can roll back if reconnect fails.
        // Without this, a failed reconnect would leave the provider holding
        // a new (possibly invalid) token with no active connection.
        const previousParams = { ...this.params };

        try {
            // Update params with new token
            this.params = {
                ...this.params,
                token: newToken,
            };
            await this.reconnect();
        } catch (e) {
            // Restore original params — the old token stays in effect so that
            // a future updateToken() call or reconnect attempt can succeed.
            this.params = previousParams;
            console.warn("[WS] Failed to update token, params restored to previous state", e);
            throw e;
        }
    }

    /**
     * Reconnect the WebSocket without destroying the provider.
     * Uses the current params (including any updated token).
     */
    public reconnect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.isDestroyed) {
                reject(new Error("Provider is destroyed"));
                return;
            }

            if (this.isSessionReplaced) {
                reject(new Error("Session was replaced by another connection"));
                return;
            }

            try {
                // Clean up awareness before disconnecting (notifies other clients we're leaving)
                this.cleanupLocalAwareness();

                // Disconnect existing connection if any
                if (this.wsconnected) {
                    this.disconnect();
                }

                // Restore user info after cleanup (it will also be restored in onStatusChange)
                if (this.userInfo) {
                    this.awareness.setLocalStateField("user", this.userInfo);
                }

                // Clear any pending reconnect
                if (this.reconnectTimeout) {
                    clearTimeout(this.reconnectTimeout);
                    this.reconnectTimeout = null;
                }

                // Set up connection listeners
                const cleanup = () => {
                    this.off("status", statusHandler);
                    this.off("connection-error", onError);
                };

                const statusHandler = (e: { status: string }) => {
                    if (e.status === "connected") {
                        // Clear the timeout only here — on actual success — so that
                        // an intermediate "connecting" event doesn't silently disarm
                        // the timeout and leave the promise permanently unresolved.
                        clearTimeout(timeoutId);
                        cleanup();
                        resolve();
                    }
                };

                const onError = (err: any) => {
                    clearTimeout(timeoutId);
                    cleanup();
                    reject(err);
                };

                this.on("status", statusHandler);
                this.on("connection-error", onError);

                // Timeout after 10 seconds; only disarmed by success/error above.
                const timeoutId = setTimeout(() => {
                    cleanup();
                    reject(new Error("Connection timeout"));
                }, 10000);

                // Attempt to connect
                this.connect();
            } catch (e) {
                console.warn("[WS] Failed to reconnect provider", e);
                reject(e);
            }
        });
    }

    /**
     * Attempt to reconnect with exponential backoff.
     * Called automatically on connection errors.
     */
    public scheduleReconnect(): void {
        if (this.isDestroyed || this.reconnectTimeout || this.isIdleDisconnected || this.isSessionReplaced) {
            return;
        }

        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            console.error("[WS] Max reconnection attempts reached");
            return;
        }

        // Exponential backoff: 1s, 2s, 4s, 8s, up to 30s max
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;

        console.log(`[WS] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            if (!this.isDestroyed && !this.isIdleDisconnected && !this.isSessionReplaced) {
                this.connect();
            }
        }, delay);
    }

    /**
     * Set up activity listeners for idle detection
     */
    private setupIdleListeners(): void {
        if (typeof window === "undefined") return;

        this.ACTIVITY_EVENTS.forEach((event) => {
            window.addEventListener(event, this.boundResetIdleTimer, { passive: true });
        });

        // Start the idle timer
        this.resetUserIdleTimer();
    }

    /**
     * Reset the idle timer on user activity
     * If we were idle-disconnected, attempt to reconnect
     */
    private resetUserIdleTimer(): void {
        if (this.isDestroyed || this.isSessionReplaced) return;

        // If we were idle-disconnected and user is now active, reconnect
        if (this.isIdleDisconnected) {
            this.isIdleDisconnected = false;
            if (!this.wsconnected) {
                console.log("[WS] User active again after idle disconnect. Reconnecting...");
                this.reconnectAttempts = 0;
                // Use reconnect() which properly tears down any lingering WebSocket
                // before creating a new one. Plain connect() is a no-op when
                // the old ws is still in CLOSING state.
                this.reconnect().catch((err) => {
                    console.warn("[WS] Failed to reconnect after idle:", err);
                    this.scheduleReconnect();
                });
            }
        }

        // Clear existing timer
        if (this.userIdleTimer) {
            clearTimeout(this.userIdleTimer);
            this.userIdleTimer = null;
        }

        // Set new idle timer
        this.userIdleTimer = setTimeout(() => {
            this.handleIdleTimeout();
        }, this.MAX_IDLE_DURATION_MS);
    }

    /**
     * Handle idle timeout - disconnect to save resources.
     * Must also handle the case where the connection was already lost
     * (e.g. server stale-cleanup closed it) — otherwise isIdleDisconnected
     * is never set and y-websocket keeps retrying in the background.
     */
    private handleIdleTimeout(): void {
        if (this.isDestroyed) return;

        console.log("[WS] User inactive for 10 minutes. Closing connection to save resources.");

        // Mark as idle-disconnected so we don't auto-reconnect
        this.isIdleDisconnected = true;

        // Cancel any pending reconnects first
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        if (this.wsconnected) {
            // Clean up awareness state before disconnecting
            this.cleanupLocalAwareness();
            // Flush any pending updates
            this.flush();
        }

        // disconnect() sets shouldConnect = false, which stops y-websocket's
        // built-in reconnect loop even if we're already disconnected.
        this.disconnect();
    }

    /**
     * Remove activity listeners
     */
    private cleanupIdleListeners(): void {
        if (typeof window === "undefined") return;

        this.ACTIVITY_EVENTS.forEach((event) => {
            window.removeEventListener(event, this.boundResetIdleTimer);
        });

        if (this.userIdleTimer) {
            clearTimeout(this.userIdleTimer);
            this.userIdleTimer = null;
        }
    }

    /**
     * Clean up local awareness state
     * Call this before disconnecting to ensure other clients are notified
     */
    private cleanupLocalAwareness(): void {
        try {
            // Remove our awareness state
            awarenessProtocol.removeAwarenessStates(this.awareness, [this.localClientId], "local cleanup");

            // Immediately send the removal if connected
            if (this.wsconnected && this.ws && this.ws.readyState === 1) {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, 1); // awareness message type
                encoding.writeVarUint8Array(
                    encoder,
                    awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.localClientId]),
                );
                this.ws.send(encoding.toUint8Array(encoder));
            }

            console.log(`[WS] Cleaned up local awareness for clientId: ${this.localClientId}`);
        } catch (e) {
            console.warn("[WS] Failed to cleanup local awareness:", e);
        }
    }

    /**
     * Handle document updates (throttled)
     */
    private onThrottledUpdate = (update: Uint8Array, origin: any): void => {
        if (origin !== this) {
            this.updateQueue.push(update);
        }
    };

    /**
     * Handle awareness updates (throttled)
     */
    private onThrottledAwareness = (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: any,
    ): void => {
        if (origin !== this) {
            const changedClients = [...added, ...updated, ...removed];

            for (const clientId of changedClients) {
                this.awarenessQueue.add(clientId);
            }

            // If user joins or leaves (not just cursor move), send immediately
            if (added.length > 0 || removed.length > 0) {
                this.flush();
            }
        }
    };

    /**
     * Start the periodic flush check loop
     */
    private startFlushLoop(): void {
        this.flushInterval = setInterval(() => {
            this.checkAndFlush();
        }, this.FLUSH_CHECK_INTERVAL_MS);
    }

    /**
     * Check if we should flush and handle connection keepalive
     */
    private checkAndFlush(): void {
        if (this.isDestroyed || !this.wsconnected) return;

        const now = Date.now();

        // Check if we have pending updates to send
        if (this.updateQueue.length > 0 || this.awarenessQueue.size > 0) {
            const userCount = this.getActiveUserCount();
            const requiredDelay = userCount <= 1 ? this.SOLO_USER_UPDATE_MS : this.MULTI_USER_UPDATE_MS;

            const timeSinceLastFlush = now - this.lastFlushTime;

            if (timeSinceLastFlush >= requiredDelay) {
                this.flush();
            }
        }

        // Send ping if we haven't received any messages for too long
        const timeSinceLastMessage = now - this.lastMessageTime;

        if (timeSinceLastMessage > this.MAX_SILENCE_DURATION_MS) {
            this.sendPing();
            // Update to prevent ping spam, actual update happens in onMessageReceived
            this.lastMessageTime = now;
        }
    }

    /**
     * Flush all pending updates to the server and BroadcastChannel
     */
    public flush(): void {
        const ws = this.ws;
        const isWsConnected = this.wsconnected && ws && ws.readyState === 1;

        // Send document updates
        if (this.updateQueue.length > 0) {
            try {
                const updates = this.updateQueue;
                this.updateQueue = [];

                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, 0); // sync message type
                for (const update of updates) {
                    syncProtocol.writeUpdate(encoder, update);
                }
                const message = encoding.toUint8Array(encoder);

                if (isWsConnected) {
                    ws.send(message);
                }

                if ((this as any).bcconnected) {
                    bc.publish((this as any).bcChannel, message, this);
                }
            } catch (e) {
                console.error("[WS] Failed to send document updates:", e);
            }
        }

        // Send awareness updates
        if (this.awarenessQueue.size > 0) {
            try {
                const changedClients = Array.from(this.awarenessQueue);
                this.awarenessQueue.clear();

                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, 1); // awareness message type
                encoding.writeVarUint8Array(
                    encoder,
                    awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
                );
                const message = encoding.toUint8Array(encoder);

                if (isWsConnected) {
                    ws.send(message);
                }

                if ((this as any).bcconnected) {
                    bc.publish((this as any).bcChannel, message, this);
                }
            } catch (e) {
                console.error("[WS] Failed to send awareness updates:", e);
            }
        }

        this.lastFlushTime = Date.now();
    }

    /**
     * Send a ping to keep the connection alive
     */
    private sendPing(): void {
        if (!this.wsconnected || !this.ws || this.ws.readyState !== 1) return;

        try {
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 9); // ping message type
            this.ws.send(encoding.toUint8Array(encoder));
        } catch (e) {
            console.warn("[WS] Failed to send ping:", e);
        }
    }

    /**
     * Check if currently connected
     */
    public get isConnected(): boolean {
        return this.wsconnected && this.ws?.readyState === 1;
    }

    /**
     * Check if idle-disconnected (waiting for user activity)
     */
    public get isIdle(): boolean {
        return this.isIdleDisconnected;
    }

    /**
     * Check if session was replaced by another connection (same user connected elsewhere)
     */
    public get wasSessionReplaced(): boolean {
        return this.isSessionReplaced;
    }

    /**
     * Destroy the provider and clean up all resources
     */
    destroy(): void {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        // Stop the flush loop
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }

        // Cancel pending reconnects
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // Clean up idle listeners
        this.cleanupIdleListeners();

        // Clean up awareness
        this.cleanupLocalAwareness();

        // Flush any remaining updates
        this.flush();

        // Remove our event handlers
        this.doc.off("update", this.onThrottledUpdate);
        this.awareness.off("update", this.onThrottledAwareness);
        this.off("status", this.onStatusChange);

        // Call parent destroy
        super.destroy();
    }
}

export const allowOnWebsocket = async (userId: string, projectId: string) => {
    const payload = {
        type: "admin-action",
        projectId,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "1m" });
    await fetch(`${process.env.NEXT_PUBLIC_COLLAB_WEBSOCKET_URL}/${projectId}/allow`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
    });
};

export const blacklistFromWebsocket = async (userId: string, projectId: string) => {
    const payload = {
        type: "admin-action",
        projectId,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: "1m" });
    await fetch(`${process.env.NEXT_PUBLIC_COLLAB_WEBSOCKET_URL}/${projectId}/blacklist`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId }),
    });
};
