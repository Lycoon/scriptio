"use client";

/**
 * Minimal microphone recorder for board voice notes.
 *
 * Recording is gated to MP4/AAC (`audio/mp4`) so every captured clip plays in
 * any browser and survives `.scriptio` export/import. Browsers whose
 * `MediaRecorder` can't produce MP4 (e.g. Firefox) report `isSupported: false`;
 * the UI then hides the record action and the user drags in an audio file
 * instead. Dropped files keep their original format.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** The single recording mime we accept — AAC in an MP4 container. */
export const RECORDING_MIME = "audio/mp4";

/** Can this browser record directly to MP4/AAC? */
export function isAudioRecordingSupported(): boolean {
    return (
        typeof MediaRecorder !== "undefined" &&
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported(RECORDING_MIME)
    );
}

export interface AudioRecorder {
    /** True only when in-browser MP4/AAC recording is available. */
    isSupported: boolean;
    /** True while a recording is in progress. */
    isRecording: boolean;
    /** Elapsed recording time in whole seconds. */
    elapsed: number;
    /** Begin recording; resolves once the mic stream is live. */
    start: () => Promise<void>;
    /** Stop recording and resolve the captured clip (`null` if nothing/failed). */
    stop: () => Promise<Blob | null>;
    /** Stop and discard the current recording. */
    cancel: () => void;
}

export function useAudioRecorder(): AudioRecorder {
    // Lazy init: `false` during SSR (MediaRecorder is undefined there). Nothing
    // depending on it is in the initial DOM, so the client value can't mismatch.
    const [isSupported] = useState(() => isAudioRecordingSupported());
    const [isRecording, setIsRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const teardown = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setIsRecording(false);
    }, []);

    const start = useCallback(async () => {
        if (recorderRef.current) return;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        chunksRef.current = [];

        const recorder = new MediaRecorder(stream, { mimeType: RECORDING_MIME });
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorderRef.current = recorder;
        recorder.start();

        setElapsed(0);
        setIsRecording(true);
        timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    }, []);

    const stop = useCallback((): Promise<Blob | null> => {
        const recorder = recorderRef.current;
        if (!recorder) return Promise.resolve(null);

        return new Promise<Blob | null>((resolve) => {
            recorder.onstop = () => {
                const blob = chunksRef.current.length
                    ? new Blob(chunksRef.current, { type: RECORDING_MIME })
                    : null;
                chunksRef.current = [];
                teardown();
                resolve(blob);
            };
            recorder.stop();
        });
    }, [teardown]);

    const cancel = useCallback(() => {
        const recorder = recorderRef.current;
        if (recorder) {
            recorder.onstop = null;
            try {
                recorder.stop();
            } catch {
                // already inactive
            }
        }
        chunksRef.current = [];
        teardown();
    }, [teardown]);

    // Release the mic if the component unmounts mid-recording.
    useEffect(() => () => teardown(), [teardown]);

    return { isSupported, isRecording, elapsed, start, stop, cancel };
}
