import { CoreEventMessage } from '@trezor/connect/src/events';
import type { ConnectSettings } from '@trezor/connect/src/types';
import { Log } from '@trezor/connect/src/utils/debug';
import { AbstractMessageChannel } from '@trezor/connect-common/src/messageChannel/abstract';
import { ServiceWorkerWindowChannel } from '@trezor/connect-common/src/messageChannel/serviceworker-window';
import { scheduleAction } from '@trezor/utils';

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
    private popupWindow:
        | { mode: 'tab'; tab: chrome.tabs.Tab }
        | { mode: 'window'; window: Window }
        | undefined;

    private extensionTabId = 0;

    constructor(settings: ConnectSettings, { logger }: { logger: Log }) {
        super(settings, { logger });
    }

    protected createChannel(): AbstractMessageChannel<CoreEventMessage> {
        return new ServiceWorkerWindowChannel<CoreEventMessage>({
            name: 'trezor-connect',
            channel: {
                here: '@trezor/connect-webextension',
                peer: '@trezor/connect-content-script',
            },
            logger: this.logger,
            currentId: () => {
                if (this.popupWindow?.mode === 'tab') return this.popupWindow?.tab.id;
            },
        });
    }

    protected async open(): Promise<void> {
        const src = this.settings.popupSrc;
        const url = this.buildPopupUrl(src);
        this.openWrapper(url);

        this.startCloseMonitoring();
    }

    private openWrapper(url: string) {
        if (this.isWebExtensionWithTab()) {
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
                                this.popupWindow = { mode: 'tab', tab: tabs[0] };
                                this.injectContentScript(tabs[0].id!);
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
                                    this.popupWindow = { mode: 'tab', tab };
                                    this.injectContentScript(tab.id!);
                                },
                            );
                        },
                    );
                }
            });
        } else {
            const windowResult = window.open(url, 'modal');
            if (!windowResult) return;
            this.popupWindow = { mode: 'window', window: windowResult };
        }

        if (!this.channel.isConnected) {
            this.channel.connect();
        }
    }

    private injectContentScript = (tabId: number) => {
        chrome.permissions.getAll(permissions => {
            if (permissions.permissions?.includes('scripting')) {
                // Retry due to Firefox where the content script is sometimes not injected on the first try
                scheduleAction(
                    () =>
                        chrome.scripting
                            .executeScript({
                                target: { tabId },
                                // content script is injected into body of func in build time.
                                func: () => {
                                    // <!--content-script-->
                                },
                            })
                            .then(() => {
                                this.logger.debug('content script injected');
                            })
                            .catch(error => {
                                this.logger.error('content script injection error', error);
                                throw error;
                            }),
                    { attempts: new Array(3).fill({ timeout: 100 }) },
                );
            } else {
                // When permissions for `scripting` are not provided 3rd party integrations have include content-script.js manually.
            }
        });
    };

    protected focusPopup(): void {
        if (this.popupWindow?.mode === 'tab' && this.popupWindow.tab.id) {
            chrome.tabs.update(this.popupWindow.tab.id, { active: true });
        } else if (this.popupWindow?.mode === 'window') {
            this.popupWindow.window.focus();
        }
    }

    protected async closePopup(): Promise<void> {
        if (!this.popupWindow) return;

        if (this.popupWindow.mode === 'tab') {
            let _e = chrome.runtime.lastError;
            if (this.popupWindow.tab.id) {
                chrome.tabs.remove(this.popupWindow.tab.id, () => {
                    _e = chrome.runtime.lastError;
                    if (_e) {
                        this.logger.error('closed with error', _e);
                    }
                });
            }
        } else if (this.popupWindow.mode === 'window') {
            this.popupWindow.window.close();
        }

        this.popupWindow = undefined;
    }

    protected isOpen(): Promise<boolean> {
        return (async () => {
            if (!this.popupWindow) return false;

            if (this.popupWindow.mode === 'tab') {
                const exists = await checkIfTabExists(this.popupWindow.tab.id);

                return exists === true;
            } else if (this.popupWindow.mode === 'window') {
                return !(this.popupWindow.window as Window).closed;
            }

            return false;
        })();
    }

    protected onClear(focus = true): void {
        // switch to previously focused tab
        if (focus && this.extensionTabId) {
            chrome.tabs.update(this.extensionTabId, { active: true });
            this.extensionTabId = 0;
        }
    }

    private isWebExtensionWithTab() {
        // Check if webextension actually has access to chrome.tabs API
        // This is not the case when used in offscreen context
        return (
            this.settings?.env === 'webextension' &&
            typeof chrome !== 'undefined' &&
            typeof chrome?.tabs !== 'undefined'
        );
    }
}
