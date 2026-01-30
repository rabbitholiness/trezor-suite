import { AbstractMessageChannel, AbstractMessageChannelConstructorParams } from './abstract';

/**
 * Communication channel between:
 * - here: chrome message port (in service worker)
 * - peer: window in popup opened via externallyConnectable
 *
 * Message flow:
 * 1. Service worker calls chrome.tabs.update() with URL hash containing message
 * 2. Popup page receives hashchange event, parses message from URL hash
 * 3. Popup sends response via chrome.runtime.sendMessage()
 * 4. Service worker receives via chrome.runtime.onMessageExternal listener
 */
export class ServiceWorkerWindowExtConnectableChannel<
    IncomingMessages extends { type: string },
> extends AbstractMessageChannel<IncomingMessages> {
    private currentId?: () => Promise<number | undefined> | undefined;
    private messageListener?: (
        message: any,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response?: any) => void,
    ) => boolean;

    constructor({
        // name,
        channel,
        logger,
        currentId,
        popupUrl,
    }: Pick<AbstractMessageChannelConstructorParams, 'channel' | 'logger'> & {
        // name: string;
        currentId?: () => Promise<number | undefined> | undefined;
        popupUrl: string;
    }) {
        super({
            channel,
            sendFn: async (message: any) => {
                /**
                 * Send message to popup via URL hash update.
                 * The popup window listens for hashchange events and parses the message from URL hash.
                 * This is necessary because extension cannot use chrome.runtime.sendMessage to communicate
                 * with the opened popup (which is in a different context).
                 * Instead, we use the externally_connectable mechanism which allows bi-directional communication:
                 * - Extension -> Popup: via URL hash update (what we do here)
                 * - Popup -> Extension: via chrome.runtime.sendMessage() which triggers onMessageExternal
                 */
                try {
                    const tabId = await this.currentId?.();
                    this.logger?.debug('CHANNEL sending to tab:', tabId, 'message:', message);

                    if (!tabId) {
                        this.logger?.error('CHANNEL: No tab ID available, cannot send message');
                        throw new Error('No tab ID available');
                    }

                    // Ensure message has the required structure for round-trip
                    if (!message.id) {
                        this.logger?.warn(
                            'CHANNEL: Message without ID, this might cause issues with response handling',
                            message,
                        );
                    }

                    // Get the current tab to preserve its URL
                    const tab = await new Promise<chrome.tabs.Tab>((resolve, reject) => {
                        chrome.tabs.get(tabId, t => {
                            if (chrome.runtime.lastError) {
                                reject(chrome.runtime.lastError);
                            } else {
                                resolve(t);
                            }
                        });
                    });

                    // Use current tab URL if available, otherwise fallback to popupUrl
                    const baseUrl = tab.url ?? popupUrl;
                    if (!baseUrl) {
                        throw new Error('Tab URL not available');
                    }

                    // Parse current URL and only update the hash to avoid page reload
                    const currentUrl = new URL(baseUrl);
                    const encodedMessage = encodeURIComponent(JSON.stringify(message));
                    // Preserve the path and query params, only change the hash
                    currentUrl.hash = `#message=${encodedMessage}`;

                    chrome.tabs.update(tabId, {
                        url: currentUrl.toString(),
                    });
                } catch (error) {
                    this.logger?.error('CHANNEL: Error sending message via tab update:', error);
                    throw error;
                }
            },
            logger,
        });

        this.currentId = currentId;
    }

    connect() {
        // Prevent duplicate listeners
        if (this.messageListener) {
            this.logger?.debug('CHANNEL: Listener already registered, skipping');

            return;
        }

        this.logger?.debug('CHANNEL: connect called, setting up onMessageExternal listener');

        this.messageListener = (message, sender, sendResponse) => {
            this.logger?.debug('CHANNEL: onMessageExternal fired:', { message, sender });

            // Verify message comes from the correct extension context
            if (!message.channel) {
                this.logger?.warn('CHANNEL: Received message without channel info, ignoring');
                sendResponse({ error: 'Missing channel info' });

                return false;
            }

            this.logger?.debug('CHANNEL: Processing message through onMessage');
            this.onMessage(message);

            // Send acknowledgement
            sendResponse({ received: true });
            this.logger?.debug('CHANNEL: Sent acknowledgement');

            // Return true to indicate we've handled the message
            return true;
        };

        chrome.runtime.onMessageExternal.addListener(this.messageListener);
        this.isConnected = true;
        this.logger?.debug('CHANNEL: Listener registered successfully');
    }

    disconnect() {
        if (!this.isConnected) return;

        // Remove the listener if it was registered
        if (this.messageListener) {
            chrome.runtime.onMessageExternal.removeListener(this.messageListener);
            this.messageListener = undefined;
        }

        this.clear();
        this.isConnected = false;
    }
}
