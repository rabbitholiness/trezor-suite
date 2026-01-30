import { CoreEventMessage } from '@trezor/connect/src/events';
import type { ConnectSettings } from '@trezor/connect/src/types';
import { Log } from '@trezor/connect/src/utils/debug';
import { AbstractMessageChannel } from '@trezor/connect-common/src/messageChannel/abstract';
import { ServiceWorkerWindowExtConnectableChannel } from '@trezor/connect-common/src/messageChannel/serviceworker-window-ext-connectable';
import { createDeferred } from '@trezor/utils';

import { Popup } from './abstract';

// Util
const checkIfTabExists = (tabId: number | undefined): Promise<boolean> =>
    new Promise(resolve => {
        if (!tabId) return resolve(false);
        function callback() {
            if (chrome.runtime.lastError) {
                resolve(false);
            } else {
                // Tab exists
                resolve(true);
            }
        }
        chrome.tabs.get(tabId, callback);
    });

export class WebExtensionPopup extends Popup {
    private popupWindow?: chrome.tabs.Tab;
    private popupWindowPromise = createDeferred<chrome.tabs.Tab>();

    private extensionTabId = 0;

    constructor(settings: ConnectSettings, { logger }: { logger: Log }) {
        super(settings, { logger });
    }

    protected createChannel(): AbstractMessageChannel<CoreEventMessage> {
        return new ServiceWorkerWindowExtConnectableChannel<CoreEventMessage>({
            channel: {
                here: '@trezor/connect-webextension-externally-connectable',
                peer: '@trezor/suite-web',
            },
            popupUrl: this.buildPopupUrl(this.settings.popupSrc),
            currentId: () => this.popupWindowPromise?.promise.then(tab => tab.id),
        });
    }

    protected open() {
        const src = this.settings.popupSrc;
        // buildPopupUrl already includes extension-id for webextension env
        const url = this.buildPopupUrl(src);

        chrome.windows.getCurrent(currentWindow => {
            this.logger.debug('opening popup. currentWindow: ', currentWindow);
            // Request coming from extension popup,
            // create new window above instead of opening new tab
            if (currentWindow.type !== 'normal') {
                chrome.windows.create({ url }, newWindow => {
                    chrome.tabs.query(
                        {
                            windowId: newWindow?.id,
                            active: true,
                        },
                        tabs => {
                            this.popupWindow = tabs[0];
                            this.popupWindowPromise?.resolve(tabs[0]);
                        },
                    );
                });
            } else {
                chrome.tabs.query(
                    {
                        currentWindow: true,
                        active: true,
                    },
                    tabs => {
                        this.extensionTabId = tabs[0].id as number;

                        chrome.tabs.create(
                            {
                                url,
                                index: tabs[0].index + 1,
                            },
                            tab => {
                                this.popupWindow = tab;
                                this.popupWindowPromise?.resolve(tab);
                            },
                        );
                    },
                );
            }
        });

        if (!this.channel.isConnected) {
            this.channel.connect();
            // Initialize the channel handshake
            this.channel.init().catch(error => {
                this.logger.error('Channel handshake failed:', error);
            });
        }
        this.startCloseMonitoring();
    }

    protected focusPopup(): void {
        if (this.popupWindow?.id) {
            chrome.tabs.update(this.popupWindow.id, { active: true });
        }
    }

    protected closePopup() {
        if (!this.popupWindow) return;

        if (this.popupWindow.id) {
            let _e = chrome.runtime.lastError;
            if (this.popupWindow.id) {
                chrome.tabs.remove(this.popupWindow.id, () => {
                    _e = chrome.runtime.lastError;
                    if (_e) {
                        this.logger.error('closed with error', _e);
                    }
                });
            }
        }

        this.popupWindow = undefined;
    }

    protected isOpen(): Promise<boolean> {
        return (async () => {
            if (!this.popupWindow) return false;

            if (this.popupWindow.id) {
                const exists = await checkIfTabExists(this.popupWindow.id);

                return exists === true;
            }

            return false;
        })();
    }

    protected onClear(focus = true): void {
        // switch to previously focused tab
        if (focus && this.extensionTabId) {
            this.logger.debug('Focusing back to extension tab:', this.extensionTabId);
            chrome.tabs.update(this.extensionTabId, { active: true }, () => {
                if (chrome.runtime.lastError) {
                    this.logger.error('Failed to focus extension tab:', chrome.runtime.lastError);
                } else {
                    this.logger.debug('Successfully focused extension tab');
                }
            });
            this.extensionTabId = 0;
        }
    }
}
