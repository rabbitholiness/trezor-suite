import EventEmitter from 'events';

import { CoreEventMessage, DEVICE_EVENT, POPUP } from '@trezor/connect/src/events';
import type { ConnectSettings } from '@trezor/connect/src/types';
import { Log } from '@trezor/connect/src/utils/debug';
import { getOrigin } from '@trezor/connect/src/utils/urlUtils';
import { VERSION } from '@trezor/connect-common/src/data/version';
import {
    AbstractMessageChannel,
    Message,
} from '@trezor/connect-common/src/messageChannel/abstract';
import type { IntervalId, TimerId } from '@trezor/type-utils';
import { Deferred, createDeferred } from '@trezor/utils';

// Event `POPUP_REQUEST_TIMEOUT` is used to close Popup window when there was no handshake from iframe.
const POPUP_REQUEST_TIMEOUT = 850;
const POPUP_CLOSE_INTERVAL = 500;

/**
 * common interface for opening suite-web popup window. It should be implemented
 * by classes specific for opening window in a browser (from a webpage) and another
 * one where window is opened from a webextension (browser extension).
 */
export abstract class Popup extends EventEmitter {
    protected settings: ConnectSettings;
    protected origin: string;
    protected locked = false;
    public channel: AbstractMessageChannel<CoreEventMessage>;
    public handshakePromise: Deferred<void> | undefined;
    protected requestTimeout: TimerId | undefined;
    protected closeInterval: IntervalId | undefined;
    protected logger: Log;

    constructor(settings: ConnectSettings, { logger }: { logger: Log }) {
        super();
        this.settings = settings;
        this.origin = getOrigin(settings.popupSrc);
        this.logger = logger;

        this.channel = this.createChannel();

        // Core mode
        this.handshakePromise = createDeferred();
        this.channel.on('message', this.handleCoreMessage.bind(this));
    }

    /**
     * Create the appropriate message channel for this popup type
     */
    protected abstract createChannel(): AbstractMessageChannel<CoreEventMessage>;

    /**
     * Open the popup window
     */
    protected abstract open(): void;

    /**
     * Close the popup window
     */
    protected abstract closePopup(): void;

    /**
     * Check if popup is still open
     */
    protected abstract isOpen(): Promise<boolean>;

    /**
     * focus existing or open
     */
    async focusOrCreate() {
        // popup request

        // check if current popup window is still open
        if (!(await this.isOpen())) {
            this.clear();
        }

        // bring popup window to front
        if (this.locked) {
            this.focusPopup();

            return;
        }

        // When requesting a popup window and there is a reference to popup window and it is not locked
        // we close it so we can open a new one.
        // This is necessary when popup window is in error state and we want to open a new one.
        if ((await this.isOpen()) && !this.locked) {
            this.close();
        }

        const openFn = this.open.bind(this);
        this.locked = true;

        const timeout = this.settings.env === 'webextension' ? 1 : POPUP_REQUEST_TIMEOUT;
        this.requestTimeout = setTimeout(() => {
            this.requestTimeout = undefined;
            openFn();
        }, timeout);
    }

    protected buildPopupUrl(src: string) {
        const params = new URLSearchParams();
        params.set('version', VERSION);
        params.set('env', this.settings.env);

        // Pass extension ID to popup via query string
        if (this.settings.env === 'webextension' && chrome?.runtime?.id) {
            params.set('extension-id', chrome.runtime.id);
        }

        return src + '?' + params.toString();
    }

    protected focusPopup(): void {
        // Platform-specific implementation - override in subclasses
    }

    protected startCloseMonitoring(): void {
        this.closeInterval = setInterval(async () => {
            if (!(await this.isOpen())) {
                this.emitClosed();
                this.clear();
            }
        }, POPUP_CLOSE_INTERVAL);
    }

    private async handleCoreMessage(message: Message<CoreEventMessage>) {
        if (message.type === POPUP.CORE_LOADED) {
            this.channel.postMessage({
                type: POPUP.HANDSHAKE,
                // in this case, settings will be validated in popup
                payload: { settings: this.settings },
            });
            this.handshakePromise?.resolve();
        } else if (message.type === POPUP.CLOSED) {
            await this.close();
            this.emitClosed();
            this.clear();
        } else if (message.event === DEVICE_EVENT) {
            this.emit(DEVICE_EVENT, message);
        }
    }

    protected clear(focus = true) {
        this.locked = false;
        this.handshakePromise = createDeferred();

        if (this.channel) {
            this.channel.disconnect();
        }

        if (this.requestTimeout) {
            clearTimeout(this.requestTimeout);
            this.requestTimeout = undefined;
        }
        if (this.closeInterval) {
            clearInterval(this.closeInterval);
            this.closeInterval = undefined;
        }

        this.onClear(focus);
    }

    /**
     * Called during clear() for platform-specific cleanup
     */
    protected abstract onClear(_focus: boolean): void;

    private async close() {
        if (!(await this.isOpen())) return;

        this.logger.debug('closing popup');
        this.closePopup();
        this.channel.clear();
    }

    public emitClosed() {
        // When popup is closed we should create a not-real response as if the request was interrupted.
        // Because when popup closes and TrezorConnect is living there it cannot respond, but we know
        // it was interrupted so we safely fake it.
        this.channel.resolveMessagePromises({
            code: 'Method_Interrupted',
            error: POPUP.CLOSED,
        });
        this.emit(POPUP.CLOSED);
    }
}
