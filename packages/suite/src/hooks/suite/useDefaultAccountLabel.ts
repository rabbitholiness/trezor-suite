import { useCallback } from 'react';

import { useTranslation } from '@suite/intl';
import { AccountType, NetworkSymbol, getNetwork } from '@suite-common/wallet-config';
import { getTitleForCoinjoinAccount } from '@suite-common/wallet-utils';

const ACCOUNT_TYPE_LABEL: Partial<Record<AccountType, string>> = {
    ledger: 'Ledger',
    segwit: 'SegWit',
    legacy: 'Legacy',
    taproot: 'Taproot',
};

export interface GetDefaultAccountLabelParams {
    accountType: AccountType;
    symbol: NetworkSymbol;
    index?: number;
    includeType?: boolean;
}

export const useDefaultAccountLabel = () => {
    const { translationString } = useTranslation();

    const getDefaultAccountLabel = useCallback(
        ({
            accountType,
            symbol,
            index = 0,
            includeType = false,
        }: GetDefaultAccountLabelParams): string => {
            if (accountType === 'coinjoin') {
                return translationString(getTitleForCoinjoinAccount(symbol));
            }

            const displayedAccountNumber = index + 1;

            const baseLabel = translationString('LABELING_ACCOUNT', {
                networkName: getNetwork(symbol).name,
                index: displayedAccountNumber,
            });

            if (!includeType) return baseLabel;

            const typeLabel = ACCOUNT_TYPE_LABEL[accountType];

            return typeLabel ? `${baseLabel} (${typeLabel})` : baseLabel;
        },
        [translationString],
    );

    return { getDefaultAccountLabel };
};
