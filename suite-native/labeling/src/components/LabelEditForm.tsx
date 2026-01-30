import { useEffect, useRef } from 'react';

import { yup } from '@suite-common/validators';
import { Button, InputType, VStack } from '@suite-native/atoms';
import { Form, TextInputField, useForm } from '@suite-native/forms';
import { Translation } from '@suite-native/intl';

const labelValidationSchema = yup.object({
    label: yup.string().required(),
});

export type FormValues = yup.InferType<typeof labelValidationSchema>;

type LabelEditFormParam = {
    label: string | null;
    onSubmit: (label: string) => void;
};

export const LabelEditForm = ({ label, onSubmit }: LabelEditFormParam) => {
    const inputRef = useRef<InputType>(null);

    const form = useForm<FormValues>({
        validation: labelValidationSchema,
        defaultValues: { label: label ?? '' },
    });

    // Sync form value when label arrives asynchronously (e.g. after enabling suite sync)
    const {
        reset,
        formState: { isDirty },
    } = form;

    useEffect(() => {
        // Only sync if the user hasn't started editing yet
        if (label !== null && !isDirty) {
            reset({ label });
        }
    }, [label, reset, isDirty]);

    const {
        handleSubmit,
        formState: { isValid },
    } = form;

    const onConfirm = handleSubmit((formValues: FormValues) => {
        onSubmit(formValues.label);
    });

    return (
        <VStack spacing="sp16">
            <Form form={form}>
                <VStack spacing="sp8">
                    <TextInputField ref={inputRef} name="label" asBottomSheetInput />
                    <Button onPress={onConfirm} size="large" isDisabled={!isValid}>
                        <Translation id="generic.buttons.confirm" />
                    </Button>
                </VStack>
            </Form>
        </VStack>
    );
};
