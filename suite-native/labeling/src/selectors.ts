import {
    SuiteSyncDataRootState,
    WithSuiteSyncAndDeviceState,
    selectSuiteSyncAccountLabel as selectAccountLabelLocalFirst,
} from '@suite-common/suite-sync';
import { NetworkSymbol } from '@suite-common/wallet-config';
import {
    AccountsRootState,
    selectIsPortfolioTrackerDevice,
    selectAccountLabel as selectReduxAccountLabel,
} from '@suite-common/wallet-core';
import { AccountDescriptor } from '@suite-common/wallet-types';
import { parseDeviceStaticSessionId } from '@suite-common/wallet-utils';
import { SettingsSliceRootState, selectIsExperimentalFeatureEnabled } from '@suite-native/settings';
import { StaticSessionId } from '@trezor/connect';

export type CombinedLabelingState = SuiteSyncDataRootState &
    WithSuiteSyncAndDeviceState &
    AccountsRootState &
    SettingsSliceRootState;

export const selectIsLabelingEnabled = (
    state: WithSuiteSyncAndDeviceState & SettingsSliceRootState,
) => {
    const isSuiteSyncEnabled = selectIsExperimentalFeatureEnabled(state, 'suite-sync');
    const isPortfolioTracker = selectIsPortfolioTrackerDevice(state);

    return isSuiteSyncEnabled && !isPortfolioTracker;
};

export const selectAccountLabel = (
    state: CombinedLabelingState & SettingsSliceRootState,
    deviceStaticSessionId: StaticSessionId,
    accountDescriptor: AccountDescriptor,
    networkSymbol: NetworkSymbol,
    accountKey: string,
) => {
    const suiteSyncLabelingEnabled = selectIsLabelingEnabled(state);

    const { walletDescriptor } = parseDeviceStaticSessionId(deviceStaticSessionId);

    const syncedLabel = selectAccountLabelLocalFirst(
        state,
        walletDescriptor,
        accountDescriptor,
        networkSymbol,
    );

    if (suiteSyncLabelingEnabled && syncedLabel) {
        return syncedLabel;
    }

    return selectReduxAccountLabel(state, accountKey);
};
