// origin: https://github.com/trezor/connect/blob/develop/src/js/popup/PopupManager.js

import type { ConnectSettings } from '@trezor/connect/src/types';
import { Log } from '@trezor/connect/src/utils/debug';

import { Popup } from './abstract';
import { WebPopup } from './web';
import { WebExtensionPopup } from './webextension-ext-connectable';

/**
 * PopupManager is the main export, maintaining backward compatibility
 * by using a factory pattern approach
 */
export class PopupManager {
    private instance: Popup;

    constructor(settings: ConnectSettings, { logger }: { logger: Log }) {
        // Create the appropriate implementation based on environment
        if (settings.env === 'webextension') {
            this.instance = new WebExtensionPopup(settings, { logger });
        } else {
            this.instance = new WebPopup(settings, { logger });
        }
    }

    focusOrCreate() {
        return this.instance.focusOrCreate();
    }

    get channel() {
        return this.instance.channel;
    }

    get handshakePromise() {
        return this.instance.handshakePromise;
    }

    emitClosed() {
        return this.instance.emitClosed();
    }

    // Expose event emitter methods
    on(event: string, listener: (...args: any[]) => void) {
        return this.instance.on(event, listener);
    }

    once(event: string, listener: (...args: any[]) => void) {
        return this.instance.once(event, listener);
    }

    off(event: string, listener: (...args: any[]) => void) {
        return this.instance.off(event, listener);
    }

    emit(event: string, ...args: any[]) {
        return this.instance.emit(event, ...args);
    }

    removeAllListeners(event?: string) {
        return this.instance.removeAllListeners(event);
    }
}
