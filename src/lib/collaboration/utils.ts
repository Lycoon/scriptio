import jwt from "jsonwebtoken";

import { WebsocketProvider } from "y-websocket";
import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as time from "lib0/time";

declare const window: any;

/**
 * This custom WebsocketProvider enables adaptive throttle depending on how many collaborators are currently
 * working on the project to save bandwith. While updates are more sparsed for a single-user, they are more
 * frequent during multi-user editing.
 */
export class ThrottledWebsocketProvider extends WebsocketProvider {
    private updateQueue: Uint8Array[] = [];
    private awarenessQueue: Set<number> = new Set();
    private flushInterval: any = null;
    private lastFlushTime: number = 0;
    private userIdleTimer: any = null;

    private readonly SOLO_USER_UPDATE = 15000;
    private readonly MULTI_USER_UPDATE = 200;
    private readonly MAX_SILENCE_DURATION = 20000;
    private readonly MAX_IDLE_DURATION = 10 * 60 * 1000;

    private readonly ACTIVITY_EVENTS = ["mousedown", "mousemove", "keydown", "touchstart", "scroll"];

    constructor(serverUrl: string, room: string, doc: Y.Doc, options: any) {
        super(serverUrl, room, doc, options);

        doc.off("update", (this as any)._updateHandler);
        doc.on("update", this.onThrottledUpdate);
        this.awareness.off("update", (this as any)._awarenessUpdateHandler);
        this.awareness.on("update", this.onThrottledAwareness);

        (this as any).messageHandlers[9] = () => {};

        this.startFlushLoop();
        this.setupIdleListeners();
    }

    private setupIdleListeners() {
        this.ACTIVITY_EVENTS.forEach((event) => {
            window.addEventListener(event, this.resetUserIdleTimer);
        });
        this.resetUserIdleTimer();
    }

    private resetUserIdleTimer = () => {
        if (!this.shouldConnect) {
            console.log("User back active: Reconnecting WebSocket.");
            this.connect();
        }

        if (this.userIdleTimer) clearTimeout(this.userIdleTimer);

        this.userIdleTimer = setTimeout(() => {
            console.log("User inactive for 10 mins. Closing connection to save resources.");
            this.disconnect();
        }, this.MAX_IDLE_DURATION);
    };

    private cleanupIdleListeners() {
        this.ACTIVITY_EVENTS.forEach((event) => {
            window.removeEventListener(event, this.resetUserIdleTimer);
        });
        if (this.userIdleTimer) clearTimeout(this.userIdleTimer);
    }

    private onThrottledUpdate = (update: Uint8Array, origin: any) => {
        if (origin !== this) {
            this.updateQueue.push(update);
        }
    };

    private onThrottledAwareness = ({ added, updated, removed }: any, origin: any) => {
        if (origin === "local") {
            const changedClients = added.concat(updated).concat(removed);

            for (const client of changedClients) {
                this.awarenessQueue.add(client);
            }

            // If user joins or leaves, send awareness update now, bypass throttling
            if (added.length > 0 || removed.length > 0) {
                this.flush();
            }
        }
    };

    private startFlushLoop() {
        this.flushInterval = setInterval(() => {
            this.checkAndFlush();
        }, 100);
    }

    private checkAndFlush() {
        const now = time.getUnixTime();
        if (this.updateQueue.length > 0 || this.awarenessQueue.size > 0) {
            const userCount = this.awareness.getStates().size;
            const requiredDelay = userCount <= 1 ? this.SOLO_USER_UPDATE : this.MULTI_USER_UPDATE;

            if (now - this.lastFlushTime > requiredDelay) {
                this.flush();
            }
        }

        const lastMessageReceived = (this as any).wsLastMessageReceived || 0;
        if (now - lastMessageReceived > this.MAX_SILENCE_DURATION) {
            this.sendPing();
            (this as any).wsLastMessageReceived = now - this.MAX_SILENCE_DURATION + 1000;
        }
    }

    public flush() {
        const ws = this.ws;
        if (!this.wsconnected || !ws || ws.readyState != 1) return;

        if (this.updateQueue.length > 0) {
            const mergedUpdate = Y.mergeUpdates(this.updateQueue);
            this.updateQueue = [];

            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 0);
            syncProtocol.writeUpdate(encoder, mergedUpdate);
            ws.send(encoding.toUint8Array(encoder));
        }

        if (this.awarenessQueue.size > 0) {
            const changedClients = Array.from(this.awarenessQueue);
            this.awarenessQueue.clear();

            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, 1);
            encoding.writeVarUint8Array(
                encoder,
                awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
            );
            ws.send(encoding.toUint8Array(encoder));
        }

        this.lastFlushTime = Date.now();
    }

    private sendPing() {
        if (!this.wsconnected || !this.ws || this.ws.readyState !== 1) return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 9);
        this.ws.send(encoding.toUint8Array(encoder));
    }

    destroy() {
        if (this.flushInterval) clearInterval(this.flushInterval);

        this.cleanupIdleListeners();
        this.flush();
        this.doc.off("update", this.onThrottledUpdate);
        this.awareness.off("update", this.onThrottledAwareness);

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
