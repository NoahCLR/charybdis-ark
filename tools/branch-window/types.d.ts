/** Parsed checkout fields remain incomplete until Git metadata is read. */
export interface Checkout {
    path: string;
    head: string;
    branch: string | null;
    main: boolean;
    missing: boolean;
    time?: number;
    subject?: string;
}
export type RunnableCheckout = Checkout & {branch: string; missing: false};
