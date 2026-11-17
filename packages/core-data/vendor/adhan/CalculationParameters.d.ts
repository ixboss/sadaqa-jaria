import type CalculationMethod from './CalculationMethod.js';
import { Madhab } from './Madhab.js';
import HighLatitudeRule from './HighLatitudeRule.js';
import { PolarCircleResolution } from './PolarCircleResolution.js';
import { Rounding } from './Rounding.js';
import { Shafaq } from './Shafaq.js';
import { ValueOf } from './TypeUtils.js';
export default class CalculationParameters {
    method: null | keyof typeof CalculationMethod;
    fajrAngle: number;
    ishaAngle: number;
    ishaInterval: number;
    maghribAngle: number;
    madhab: ValueOf<typeof Madhab>;
    highLatitudeRule: ValueOf<typeof HighLatitudeRule>;
    adjustments: {
        fajr: number;
        sunrise: number;
        dhuhr: number;
        asr: number;
        maghrib: number;
        isha: number;
    };
    methodAdjustments: {
        fajr: number;
        sunrise: number;
        dhuhr: number;
        asr: number;
        maghrib: number;
        isha: number;
    };
    polarCircleResolution: ValueOf<typeof PolarCircleResolution>;
    rounding: ValueOf<typeof Rounding>;
    shafaq: ValueOf<typeof Shafaq>;
    constructor(method: null | keyof typeof CalculationMethod, fajrAngle?: number, ishaAngle?: number, ishaInterval?: number, maghribAngle?: number);
    nightPortions(): {
        fajr: number;
        isha: number;
    };
}
