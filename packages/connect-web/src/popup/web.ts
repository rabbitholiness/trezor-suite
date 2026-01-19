import { CoreEventMessage } from '@trezor/connect/src/events';
import type { ConnectSettings } from '@trezor/connect/src/types';
import { Log } from '@trezor/connect/src/utils/debug';
import { AbstractMessageChannel } from '@trezor/connect-common/src/messageChannel/abstract';
import { WindowWindowChannel } from '@trezor/connect-common/src/messageChannel/window-window';

import { Popup } from './abstract';

export class WebPopup extends Popup {
    private popupWindow: Window | undefined;

    constructor(settings: ConnectSettings, { logger }: { logger: Log }) {
        super(settings, { logger });
    }

    protected createChannel(): AbstractMessageChannel<CoreEventMessage> {
        return new WindowWindowChannel<CoreEventMessage>({
            windowHere: window,
            windowPeer: () => this.popupWindow,
            channel: {
                here: '@trezor/connect-web',
                peer: '@trezor/connect-popup',
            },
            logger: this.logger,
            origin: this.origin,
        });
    }

    protected open(): void {
        const src = this.settings.popupSrc;
        const url = this.buildPopupUrl(src);

        const windowResult = window.open(url, 'modal');

        if (!windowResult) return;

        this.popupWindow = windowResult;

        if (!this.channel.isConnected) {
            this.channel.connect();
        }

        this.startCloseMonitoring();
    }

    protected focusPopup(): void {
        this.popupWindow?.focus();
    }

    protected closePopup(): void {
        this.popupWindow?.close();
        this.popupWindow = undefined;
    }

    protected isOpen(): Promise<boolean> {
        return Promise.resolve(this.popupWindow !== undefined && !this.popupWindow.closed);
    }

    protected onClear(): void {
        // No platform-specific cleanup needed for web popup
    }
}
