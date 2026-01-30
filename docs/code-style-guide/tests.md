# Tests

## Reading

- Avoid testing implementation details - https://kentcdodds.com/blog/testing-implementation-details

## Translations in tests

Copy in the app may change as translators and copywriters update the strings in Crowdin, independently from developers. To avoid failing tests in Crowdin sync PRs, get a string by its translation ID instead of using the literal text.

```ts
// bad
expect(screen.getByText(
	'This can change with a Crowdin sync and someone will have to fix the test.'
).toBeTruthy();

// good
expect(screen.getByText(getTranslation(
	'path.to.translation'
))).toBeTruthy();

// In case there is some string that must not be changed:
expect(screen.getByText(getTranslation(
	'path.to.translation'
))).toBe(
	'I want a developer to check this important text if it is changed in Crowdin.'
);
```

## Mocks (& Fixtures)

### Typing
All fixtures and mocks shall be typed. Using `as` to cast some uncompleted object is only last resort.

Although it may produce some boilerplate code, the fixtures shall be declaratively typed. In case the type is changed, without typed fixtures, this will produce a hardly fixable failed test instead of easily fixable type-error.

### Reusability
Ideally, shared mocks shall not be needed. Dependencies shall be that small and clear, that tests shall only need to
mock what they are testing and nothing else. Thus, reusable mocks shall not be needed.

However, we have legacy code, or it's too complicated (costly) to make perfect code and having a shared mock is useful.

We reuse mocks to not repeat ourselves in test with details, that are not relevant to the test. For that, they need to be very generic and non-opinionated.

- Shared mocks shall always be reusable without complicated re-configuration.
- Test shall not relay on default in this mocks.
- Change in a shared mock shall not cause any test to fail.


### Organization & Naming Convention
- Mock/fixture files shall be places in the same package where the subject to be mock resides.
- Putting it into type package is ok. Mock for `Device` shall be in the same package where the *type declaration* is
- Use `mock` prefix to distinguish it from type or original implementation. `Device` => `mockDevice`.
- Prefer factories to static object. Factory is better as it can provide API to create a mock with desired changes. (`mockDevice(data: Partial<Device>): Device => {...}`)
- Put mocks into `mocks` directory into the same package
- Export them from package in separate file. In this example it will be: `import { mockDevice } from '@common/device-types/mocks'`
  ```
  device-types
    - mocks
       - mockDevice.ts
       - index.ts
    - src
       - device.ts
  ```
- Name the file, same as the export mock.
