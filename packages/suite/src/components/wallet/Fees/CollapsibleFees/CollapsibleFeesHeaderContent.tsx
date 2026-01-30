import { TranslationKey } from '@suite/intl';
import { Collapsible, Row } from '@trezor/components';
import { TypographyStyle } from '@trezor/theme';

import { ContentFlex } from 'src/support/suite/ContentFlex';

import { CollapsibleFeesHeader } from './CollapsibleFeesHeader';
import { MaximumFee } from './MaximumFee';
import { useTransactionMaxFee } from './hooks/useTransactionMaxFee';

export type CollapsibleFeesHeaderContentProps = {
    label?: TranslationKey;
    headerTypographyStyle?: TypographyStyle;
    supportsAdjustableFees: boolean;
    txMaxFee: ReturnType<typeof useTransactionMaxFee>;
    isControlled: boolean;
};

export const CollapsibleFeesHeaderContent = ({
    label,
    headerTypographyStyle = 'body',
    supportsAdjustableFees,
    txMaxFee,
    isControlled,
}: CollapsibleFeesHeaderContentProps) => {
    const content = (
        <ContentFlex justifyContent="space-between" gap={12}>
            <CollapsibleFeesHeader label={label} typographyStyle={headerTypographyStyle} />
            <Row gap={12}>
                <MaximumFee typographyStyle={headerTypographyStyle} txMaxFee={txMaxFee} />
                {supportsAdjustableFees && (
                    <Collapsible.ToggleIcon iconName="caretDown" size="mediumLarge" />
                )}
            </Row>
        </ContentFlex>
    );

    return isControlled ? (
        content
    ) : (
        <Collapsible.Toggle data-testid="@wallet/fees/collapsible-fees-toggle">
            {content}
        </Collapsible.Toggle>
    );
};
