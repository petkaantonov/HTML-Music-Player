import { TouchEventType } from "./GestureRecognizerContext";

export type GestureOrEvent = GestureObject | TouchEvent;

export function isGestureObject(e: GestureObject | TouchEvent): e is GestureObject {
    return `originalEvent` in e;
}

export default class GestureObject {
    clientX: number;
    clientY: number;
    pageX: number;
    pageY: number;
    screenX: number;
    screenY: number;
    timeStamp: number;
    target: HTMLElement;
    currentTarget: HTMLElement;
    type: TouchEventType;
    isFirst: boolean;
    originalEvent: TouchEvent;

    constructor(e: GestureOrEvent, touch: Touch, isFirst?: boolean) {
        this.clientX = touch.clientX;
        this.clientY = touch.clientY;
        this.pageX = touch.pageX;
        this.pageY = touch.pageY;
        this.screenX = touch.screenX;
        this.screenY = touch.screenY;
        this.timeStamp = e.timeStamp;
        this.target = e.target as HTMLElement;
        this.currentTarget = e.currentTarget as HTMLElement;
        this.type = e.type as TouchEventType;
        this.isFirst = !!isFirst;
        this.originalEvent = isGestureObject(e) ? e.originalEvent : e;
    }

    get changedTouches() {
        return this.originalEvent.changedTouches;
    }

    preventDefault(): void {
        this.originalEvent.preventDefault();
    }
    stopPropagation(): void {
        this.originalEvent.stopPropagation();
    }
    stopImmediatePropagation(): void {
        this.originalEvent.stopImmediatePropagation();
    }
}
