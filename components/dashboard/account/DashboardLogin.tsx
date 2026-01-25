"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { login } from "@src/lib/utils/requests";
import { ApiResponse } from "@src/lib/utils/api-utils";
import { LoginBody } from "@src/lib/utils/api-bodies";
import { isTauri } from "@tauri-apps/api/core";

import sharedStyles from "../project/ProjectSettings.module.css";

const DashboardLogin = () => {
    const { mutate } = useSWRConfig();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        const body: LoginBody = { email, password };
        const res = await login(body);

        if (res.ok) {
            const json = (await res.json()) as ApiResponse;

            if (isTauri() && json.data?.token) {
                const { setDesktopToken } = await import("@src/lib/desktop-auth");
                await setDesktopToken(json.data.token);
            }

            await mutate("/api/users/cookie");
            setMessage({ type: "success", text: "Logged in successfully" });
        } else {
            const json = (await res.json()) as ApiResponse;
            setMessage({ type: "error", text: json.message || "Login failed" });
        }

        setLoading(false);
    };

    return (
        <form className={sharedStyles.settingsForm} onSubmit={handleSubmit}>
            <div className={sharedStyles.formGroup}>
                <label className={sharedStyles.helpText} style={{ fontSize: "0.85rem" }}>
                    Email
                </label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setMessage(null); }}
                    className={sharedStyles.input}
                    placeholder="Enter your email..."
                    required
                />
            </div>

            <div className={sharedStyles.formGroup}>
                <label className={sharedStyles.helpText} style={{ fontSize: "0.85rem" }}>
                    Password
                </label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setMessage(null); }}
                    className={sharedStyles.input}
                    placeholder="Enter your password..."
                    required
                />
            </div>

            {message && (
                <p style={{ color: message.type === "error" ? "var(--error)" : "var(--success)", fontSize: "0.85rem" }}>
                    {message.text}
                </p>
            )}

            <div className={sharedStyles.formActions}>
                <button
                    type="submit"
                    className={`${sharedStyles.formBtn} ${sharedStyles.success}`}
                    disabled={loading}
                >
                    {loading ? "Logging in..." : "Log in"}
                </button>
            </div>
        </form>
    );
};

export default DashboardLogin;
