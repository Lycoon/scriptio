// Ambient module declarations for packages whose package.json "exports" map is missing
// a "types" condition, which breaks moduleResolution:bundler. This file must have no
// top-level import/export so TypeScript treats it as a script file and these declarations
// act as true ambient overrides rather than module augmentations.

declare module "*.svg" {
    import type { FC, SVGProps } from "react";
    const ReactComponent: FC<SVGProps<SVGSVGElement>>;
    export default ReactComponent;
}

declare module "@formkit/auto-animate" {
    interface Coordinates { top: number; left: number; width: number; height: number }
    export interface AnimationController<P = unknown> {
        readonly parent: Element;
        enable: () => void;
        disable: () => void;
        isEnabled: () => boolean;
        update?: (newParams: P) => void;
        destroy?: () => void;
    }
    export interface AutoAnimateOptions {
        duration: number;
        easing: "linear" | "ease-in" | "ease-out" | "ease-in-out" | string;
        disrespectUserMotionPreference?: boolean;
    }
    export interface AutoAnimationPlugin {
        <T extends "add" | "remove" | "remain">(
            el: Element, action: T,
            newCoordinates?: T extends "add" | "remain" | "remove" ? Coordinates : undefined,
            oldCoordinates?: T extends "remain" ? Coordinates : undefined,
        ): KeyframeEffect;
    }
    export function getTransitionSizes(el: Element, oldCoords: Coordinates, newCoords: Coordinates): number[];
    export default function autoAnimate(el: HTMLElement, config?: Partial<AutoAnimateOptions> | AutoAnimationPlugin): AnimationController;
    export const vAutoAnimate: {
        mounted: (el: HTMLElement, binding: { value: Partial<AutoAnimateOptions> | AutoAnimationPlugin | undefined }) => void;
    };
}

declare module "tinykeys" {
    export type KeyBindingPress = [mods: string[], key: string | RegExp];
    export interface KeyBindingMap { [keybinding: string]: (event: KeyboardEvent) => void }
    export interface KeyBindingHandlerOptions { timeout?: number }
    export interface KeyBindingOptions extends KeyBindingHandlerOptions {
        event?: "keydown" | "keyup";
        capture?: boolean;
    }
    export function parseKeybinding(str: string): KeyBindingPress[];
    export function matchKeyBindingPress(event: KeyboardEvent, [mods, key]: KeyBindingPress): boolean;
    export function createKeybindingsHandler(keyBindingMap: KeyBindingMap, options?: KeyBindingHandlerOptions): EventListener;
    export function tinykeys(target: Window | HTMLElement, keyBindingMap: KeyBindingMap, options?: KeyBindingOptions): () => void;
}
