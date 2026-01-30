import { useEffect, useRef, useState } from 'react';

import {
    CALL_SOURCE_WEB,
    ManifestPartial,
    connectPopupCallThunk,
    connectPopupCancelThunk,
    getPopupCallDeferred,
    queuePopupCall,
} from '@suite-common/connect-popup';
import { CallMethodKeys, IFRAME, POPUP, RESPONSE_EVENT, createPopupMessage } from '@trezor/connect';

import { useDispatch, useSelector } from 'src/hooks/suite';

// Declare chrome type for webextension API
declare const chrome: any;

const channel = {
    here: '@trezor/suite-web', // todo: probably connect-popup
    peer: '@trezor/connect-webextension-externally-connectable',
};

// Store extension ID globally so we can access it for close signal
let currentExtensionId: string | null = null;
// Track if this popup was opened via webextension
export let isWebextensionMode = false;

const postMessageToParent = (message: any, extensionId: string) => {
    // Ensure message has proper channel metadata
    if (!message.channel) {
        message.channel = channel;
    }

    // this should not happen
    if (!chrome?.runtime?.sendMessage) {
        console.error('chrome.runtime.sendMessage not available!');

        return;
    }

    chrome.runtime.sendMessage(extensionId, message, (response: any) => {
        if (chrome.runtime.lastError) {
            console.error('Failed to send message to webextension:', chrome.runtime.lastError);
        } else {
            console.log('>>>>>> Response from webextension:', response);
        }
    });
};

/**
 * Public function to close the webextension popup window.
 * Should be called when user clicks close/cancel button.
 */
export const closeWebextensionPopup = () => {
    console.log('>>>>>> closeWebextensionPopup called, currentExtensionId:', currentExtensionId);

    if (!currentExtensionId) {
        console.warn('closeWebextensionPopup: No extension ID available');

        return;
    }

    const closeMessage = {
        type: POPUP.CLOSED,
        payload: { success: true },
    };

    console.log('>>>>>> Sending close signal to extension with message:', closeMessage);
    postMessageToParent(closeMessage, currentExtensionId);

    // Also attempt to close the window after a small delay to ensure the message is sent.
    // If this is a tab opened by the extension, the extension will close it.
    // If the browser allows it, we close it from here as fallback.
    setTimeout(() => {
        console.log('>>>>>> Attempting to close web window');
        try {
            window.close();
        } catch (error) {
            // Browser may block this, but that's okay - the extension will close the tab
            console.log('>>>>>> Could not close window (expected browser security restriction)');
        }
    }, 50);
};

export const useConnectPopupWebextension = () => {
    const dispatch = useDispatch();
    const lifecycle = useSelector(state => state.suite.lifecycle);
    const manifest = useRef<ManifestPartial | undefined>(undefined);
    const coreLoadedSent = useRef(false);
    const [pendingHandshake, setPendingHandshake] = useState<string | undefined>();
    const [extensionId, setExtensionId] = useState<string | null>(null);

    const [incomingMessagesQueue, setIncomingMessagesQueue] = useState<any[]>([]);

    // Monitor extension-id query param changes
    useEffect(() => {
        const readExtensionId = () => {
            const search = new URLSearchParams(window.location.search);
            const newExtensionId = search.get('extension-id');
            // get message from hash part of URL
            const message = new URLSearchParams(window.location.hash.replace('#', '?')).get(
                'message',
            );
            const parsedMessage = message ? JSON.parse(decodeURIComponent(message)) : null;

            // Only update extensionId if it changed to avoid unnecessary re-renders
            if (newExtensionId && newExtensionId !== extensionId) {
                setExtensionId(newExtensionId);
                currentExtensionId = newExtensionId;
                isWebextensionMode = true; // Set flag when we detect webextension mode
                console.log('>>>>>> Webextension mode detected, extensionId:', newExtensionId);
            }

            if (parsedMessage) {
                console.log('>>>>>> Received message from URL hash:', parsedMessage);
                setIncomingMessagesQueue(prev => [...prev, parsedMessage]);
                // Clear the hash to prevent reprocessing the same message
                // Use replaceState to avoid triggering another hashchange event
                window.history.replaceState(
                    null,
                    '',
                    window.location.pathname + window.location.search,
                );
            }
        };

        // Read initial value
        readExtensionId();

        // Monitor URL changes (for SPAs with history API)
        window.addEventListener('popstate', readExtensionId);

        // Monitor hash changes
        window.addEventListener('hashchange', readExtensionId);

        return () => {
            window.removeEventListener('popstate', readExtensionId);
            window.removeEventListener('hashchange', readExtensionId);
        };
    }, []);

    useEffect(() => {
        console.log('>>>>>> extensionId changed >>>>>>', extensionId);
        // Update global extension ID for close signal
        currentExtensionId = extensionId;
        console.log('>>>>>> currentExtensionId updated to:', currentExtensionId);
    }, [extensionId]);

    useEffect(() => {
        console.log('>>>>>> processing incomingMessagesQueue >>>>>>', incomingMessagesQueue);
    }, [incomingMessagesQueue]);

    // Send POPUP.CORE_LOADED when lifecycle becomes ready
    useEffect(() => {
        if (lifecycle.status !== 'ready' || !extensionId || coreLoadedSent.current) return;

        console.log('>>>>>> Suite lifecycle ready, sending CORE_LOADED');
        postMessageToParent(createPopupMessage(POPUP.CORE_LOADED), extensionId);
        coreLoadedSent.current = true;
    }, [lifecycle.status, extensionId]);

    // Process incoming messages from the queue
    useEffect(() => {
        if (!extensionId || incomingMessagesQueue.length === 0) {
            return;
        }

        // Check if extension is installed
        if (typeof chrome === 'undefined' || !chrome?.runtime) {
            return;
        }

        const processMessage = async () => {
            const event = incomingMessagesQueue[0];

            if (!event) {
                return;
            }

            try {
                // Handle different message types
                if (event.type === 'channel-handshake-request') {
                    // Respond with handshake confirm immediately, regardless of lifecycle status
                    // This is needed to establish the channel communication
                    const handshakeConfirm = {
                        type: 'channel-handshake-confirm',
                        id: event.id,
                        success: true,
                        payload: undefined,
                    };
                    console.log('>>>>>> Sending handshake-confirm with extensionId:', extensionId);
                    postMessageToParent(handshakeConfirm, extensionId);
                    // Remove processed message
                    setIncomingMessagesQueue(prev => prev.slice(1));
                } else if (event.type === POPUP.INIT) {
                    // Handle POPUP.INIT message - suite-web initialization settings
                    console.log('>>>>>> POPUP.INIT received:', event);
                    // Remove processed message
                    setIncomingMessagesQueue(prev => prev.slice(1));
                } else if (lifecycle.status !== 'ready') {
                    // Other messages require suite to be ready
                    // Skip processing this message until suite is ready
                    return;
                } else if (event.type === POPUP.HANDSHAKE) {
                    manifest.current = {
                        ...event.payload.settings.manifest,
                        npmVersion: event.payload.settings.version,
                    };
                    setPendingHandshake(event.id);
                    // Remove processed message
                    setIncomingMessagesQueue(prev => prev.slice(1));
                } else if (event.type === IFRAME.CALL) {
                    if (!manifest.current) {
                        console.warn(
                            'Connect Popup Web: manifest is not set yet, cannot process IFRAME.CALL',
                        );
                        return;
                    }

                    await queuePopupCall();
                    const deferred = getPopupCallDeferred(true);
                    dispatch(
                        connectPopupCallThunk({
                            method: event.payload.method as CallMethodKeys,
                            payload: event.payload,
                            source: {
                                type: CALL_SOURCE_WEB,
                                origin: event.origin || extensionId,
                                manifest: manifest.current,
                            },
                        }),
                    );

                    const response = await deferred.promise;
                    console.log('>>>>>>> sending response to webextension', response);
                    postMessageToParent(
                        {
                            id: event.id,
                            type: RESPONSE_EVENT,
                            payload: response,
                        },
                        extensionId,
                    );
                    // Remove processed message
                    setIncomingMessagesQueue(prev => prev.slice(1));
                } else if (event.type === POPUP.CLOSED) {
                    dispatch(connectPopupCancelThunk(event.payload));
                    // Remove processed message
                    setIncomingMessagesQueue(prev => prev.slice(1));
                } else {
                    console.warn('Unknown message type from webextension:', event.type, event);
                    // Remove unhandled message from queue
                    setIncomingMessagesQueue(prev => prev.slice(1));
                }
            } catch (error) {
                console.error('Error processing message from webextension:', error);
                // Remove failed message from queue
                setIncomingMessagesQueue(prev => prev.slice(1));
            }
        };

        processMessage();
    }, [extensionId, lifecycle.status, incomingMessagesQueue, dispatch]);

    // Respond to handshake after suite is ready and we have received POPUP.HANDSHAKE
    useEffect(() => {
        // Only respond to handshake once suite is ready, we have a pending handshake ID, and extension ID
        if (lifecycle.status !== 'ready' || !pendingHandshake || !extensionId) return;

        console.log('>>>>>> Sending POPUP.HANDSHAKE response');
        postMessageToParent(
            {
                id: pendingHandshake,
                type: POPUP.HANDSHAKE,
            },
            extensionId,
        );
        // Clear pending handshake to prevent re-sending
        setPendingHandshake(undefined);
    }, [lifecycle.status, pendingHandshake, extensionId]);
};
