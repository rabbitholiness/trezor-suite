import { type Page, chromium } from '@playwright/test';
import path from 'path';

import { createTestAnnotation } from '@trezor/e2e-utils';

import { BRIDGE_VERSION } from '../../support/bridge';
import { mockRemoteMessageSystem } from '../../support/common';
import { expect, test } from '../../support/fixtures';
import { AnalyticsSection } from '../../support/pageObjects/analyticsSection';
import { ConnectPermissionsModal } from '../../support/pageObjects/connectPermissionsModal';
import { DevicePrompt } from '../../support/pageObjects/devicePrompt';
import { OnboardingPage } from '../../support/pageObjects/onboarding/onboardingPage';
import { SettingsPage } from '../../support/pageObjects/settings/settingsPage';
import { enhancePage } from '../../support/testExtends/enhancePage';

function getConnectExplorerUrlSldev(branch: string = 'develop') {
    return `https://dev.suite.sldev.cz/connect/${branch}/`;
}

function getConnectExplorerUrl() {
    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        return 'http://localhost:8088/';
    }

    return getConnectExplorerUrlSldev(baseUrl.match(/suite-web\/(.*?)\/web/)?.[1]);
}

async function gotoConnectExplorer(page: Page, method: string) {
    const path = `methods/${method}/?core-mode=suite-web)}`;
    try {
        await page.goto(`${getConnectExplorerUrl()}${path}`, { waitUntil: 'load' });
    } catch {
        // Fallback to develop branch
        await page.goto(`${getConnectExplorerUrlSldev()}${path}`, {
            waitUntil: 'load',
        });
    }
}

test.describe('TrezorConnect popup web', { tag: ['@smoke', '@T3T1', '@webOnly'] }, () => {
    test.beforeEach(async ({ onboardingPage }) => {
        await onboardingPage.completeOnboarding();
    });

    test(
        'TrezorConnect.getAddress',
        {
            annotation: createTestAnnotation({
                testCase: 'Suite Web Connect: Happy path scenario with getAddress',
            }),
        },
        async ({ page, trezorUserEnvLink }) => {
            await gotoConnectExplorer(page, 'bitcoin/getAddress');

            // expand method tester
            await page.getByTestId('@api-playground/collapsible-box').click();
            await expect(page.getByTestId('@submit-button')).toBeVisible();
            await page.getByTestId('@submit-button').click();
            // await popup opening
            const suite = await page.waitForEvent('popup');
            const connectPermissionsModal = new ConnectPermissionsModal(suite);
            await expect(connectPermissionsModal.appName).toHaveText('Trezor Connect Explorer', {
                timeout: 10_000,
            });
            connectPermissionsModal.confirmButton.click();

            await expect(connectPermissionsModal.loadingHeader).toHaveText(
                'Export Bitcoin address',
            );
            await suite.getByTestId('@connect-address-confirmation/confirm-button').click();

            await expect(
                suite.getByTestId('@connect-address-confirmation/verify-button/0'),
            ).toBeDisabled();
            await suite.waitForTimeout(1000);
            await trezorUserEnvLink.pressYes();

            await expect(
                suite.getByTestId('@connect-address-confirmation/verified-badge/0'),
            ).toBeVisible();

            await suite.getByTestId('@connect-address-confirmation/close-button').click();

            const response = page.getByTestId('@response');
            await expect(response).toHaveText(/success: true/);
        },
    );

    test(
        'call cancellation',
        {
            annotation: createTestAnnotation({
                testCase: 'Suite Web Connect: Call cancelled by user',
            }),
        },
        async ({ page }) => {
            await gotoConnectExplorer(page, 'bitcoin/getAddress');

            // expand method tester
            await page.getByTestId('@api-playground/collapsible-box').click();
            await expect(page.getByTestId('@submit-button')).toBeVisible();
            await page.getByTestId('@submit-button').click();

            // await popup opening
            const suite = await page.waitForEvent('popup');

            const connectPermissionsModal = new ConnectPermissionsModal(suite);
            await expect(connectPermissionsModal.appName).toHaveText('Trezor Connect Explorer', {
                timeout: 10_000,
            });
            connectPermissionsModal.confirmButton.click();

            await expect(connectPermissionsModal.loadingHeader).toHaveText(
                'Export Bitcoin address',
            );
            await suite.getByTestId('@connect-address-confirmation/close-button').click();

            const response = page.getByTestId('@response');
            await expect(response).toHaveText(/success: false/);
        },
    );
});

test.describe(
    'TrezorConnect webextension -> Suite Web',
    { tag: ['@smoke', '@T3T1', '@webOnly'] },
    () => {
        test(
            'webextension can export address via suite-web popup',
            {
                annotation: createTestAnnotation({
                    testCase:
                        'Suite Web Connect (webextension): Happy path scenario with getAddress via suite-web',
                }),
            },
            async ({ model, emulatorStartConf, trezorUserEnvLink }) => {
                const extensionPath = path.join(
                    __dirname,
                    '../../../../packages/connect-explorer/build-webextension',
                );

                await trezorUserEnvLink.startBridge(BRIDGE_VERSION);

                const userDataDir = path.join(
                    test.info().outputDir,
                    'connect-explorer-webextension',
                );
                const context = await chromium.launchPersistentContext(userDataDir, {
                    headless: false,
                    args: [
                        `--disable-extensions-except=${extensionPath}`,
                        `--load-extension=${extensionPath}`,
                    ],
                    viewport: { width: 1280, height: 720 },
                });

                try {
                    await context.addInitScript(() => {
                        (window as any).Playwright = true;
                    });

                    const serviceWorker =
                        context.serviceWorkers()[0] ||
                        (await context.waitForEvent('serviceworker', { timeout: 10_000 }));

                    if (!serviceWorker) {
                        throw new Error('Connect Explorer webextension service worker not found');
                    }

                    const extensionId = serviceWorker.url().split('/')[2];
                    const extensionUrl = `chrome-extension://${extensionId}/methods/bitcoin/getAddress/index.html?core-mode=suite-web`;

                    const popupPage = await context.newPage();
                    await popupPage.goto(extensionUrl, { waitUntil: 'domcontentloaded' });

                    await popupPage.getByTestId('@api-playground/collapsible-box').click();
                    await expect(popupPage.getByTestId('@submit-button')).toBeVisible();
                    await popupPage.getByTestId('@submit-button').click();

                    // Wait for Suite popup to open
                    let suite: Page | undefined;
                    const suitePages = context
                        .pages()
                        .filter(p => p.url().includes('http://localhost:8000'));

                    if (suitePages.length === 0) {
                        // Wait for Suite page to open
                        suite = await context.waitForEvent('page', { timeout: 5000 });
                    } else {
                        suite = suitePages[0];
                    }

                    if (!suite) {
                        throw new Error('Suite popup page not found');
                    }

                    // Wait for Suite to load fully
                    await suite.waitForLoadState('domcontentloaded', { timeout: 10_000 });

                    // Set up the Suite page for testing
                    enhancePage(suite);

                    await mockRemoteMessageSystem(suite);
                    const onboardingPage = new OnboardingPage(
                        suite,
                        model as any,
                        new DevicePrompt(suite, model as any),
                        new AnalyticsSection(suite),
                        new SettingsPage(suite),
                        emulatorStartConf as any,
                    );
                    await onboardingPage.completeOnboarding();

                    // Wait for the modal to appear
                    const connectPermissionsModal = new ConnectPermissionsModal(suite);

                    await expect(connectPermissionsModal.appName).toHaveText(
                        'Trezor Connect Explorer',
                        {
                            timeout: 15_000,
                        },
                    );
                    connectPermissionsModal.confirmButton.click();

                    await expect(connectPermissionsModal.loadingHeader).toHaveText(
                        'Export Bitcoin address',
                    );
                    await suite.getByTestId('@connect-address-confirmation/confirm-button').click();

                    await expect(
                        suite.getByTestId('@connect-address-confirmation/verify-button/0'),
                    ).toBeDisabled();
                    await suite.waitForTimeout(1000);
                    await trezorUserEnvLink.pressYes();

                    await expect(
                        suite.getByTestId('@connect-address-confirmation/verified-badge/0'),
                    ).toBeVisible();

                    await suite.getByTestId('@connect-address-confirmation/close-button').click();

                    const response = popupPage.getByTestId('@response');
                    await expect(response).toHaveText(/success: true/);
                } finally {
                    await context.close();
                }
            },
        );
    },
);
