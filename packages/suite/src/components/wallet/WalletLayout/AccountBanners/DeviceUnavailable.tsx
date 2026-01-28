import { Translation } from '@suite/intl';
import { acquireDevice } from '@suite-common/wallet-core';
import { Banner } from '@trezor/components';

import { applySettings } from 'src/actions/settings/deviceSettingsActions';
import { useDevice, useDispatch } from 'src/hooks/suite';

const EnablePassphrase = () => {
    const dispatch = useDispatch();
    const { isLocked } = useDevice();
    const handleButtonClick = () => {
        dispatch(applySettings({ use_passphrase: true }));
    };

    return (
        <Banner
            intent="info"
            rightContent={
                <Banner.Button onClick={handleButtonClick} isLoading={isLocked()}>
                    <Translation id="TR_ACCOUNT_ENABLE_PASSPHRASE" />
                </Banner.Button>
            }
            description={<Translation id="TR_ACCOUNT_PASSPHRASE_DISABLED" />}
        />
    );
};

const StartThpPairing = () => {
    const dispatch = useDispatch();
    const { device, isLocked } = useDevice();
    const handleButtonClick = () => {
        dispatch(acquireDevice({ requestedDevice: device }));
    };

    return (
        <Banner
            intent="info"
            rightContent={
                <Banner.Button onClick={handleButtonClick} isLoading={isLocked()}>
                    <Translation id="TR_THP_CREATE_SECURE_CONNECTION" />
                </Banner.Button>
            }
            description={<Translation id="TR_NEEDS_ATTENTION_UNACQUIRED_THP_REQUIRED" />}
        />
    );
};

export const DeviceUnavailable = () => {
    const { device } = useDevice();
    const passphraseProtection = !!device?.features?.passphrase_protection;

    if (!device?.connected || device.available || !device.features || passphraseProtection) {
        return null;
    }
    if (device.status === 'thp-locked') {
        return <StartThpPairing />;
    }

    return <EnablePassphrase />;
};
