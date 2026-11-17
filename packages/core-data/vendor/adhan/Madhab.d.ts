import { ValueOf } from './TypeUtils.js';
export declare const Madhab: {
    readonly Shafi: "shafi";
    readonly Hanafi: "hanafi";
};
export declare function shadowLength(madhab: ValueOf<typeof Madhab>): 1 | 2;
