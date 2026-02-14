import 'obsidian';

declare module 'obsidian' {
    /**
     * Secret storage for plugins.
     * @public
     * @since 1.11.4
     */
    class SecretStorage {
        getLastAccess(id: string): number | null;
        setSecret(id: string, value: string): void;
        getSecret(id: string): string | null;
        listSecrets(): string[];
    }

    /**
     * A text component for secrets.
     * @public
     * @since 1.11.1
     */
    class SecretComponent extends BaseComponent {
        constructor(app: App, containerEl: HTMLElement);
        setValue(value: string): this;
        onChange(callback: (value: string) => unknown): this;
    }

    interface App {
        /**
         * @public
         * @since 1.11.4
         */
        secretStorage: SecretStorage;
    }
}
