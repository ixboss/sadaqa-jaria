import Prayer from './Prayer.js';
import CalculationParameters from './CalculationParameters.js';
import Coordinates from './Coordinates.js';
import { ValueOf } from './TypeUtils.js';
export default class PrayerTimes {
    coordinates: Coordinates;
    date: Date;
    calculationParameters: CalculationParameters;
    fajr: Date;
    sunrise: Date;
    dhuhr: Date;
    asr: Date;
    sunset: Date;
    maghrib: Date;
    isha: Date;
    constructor(coordinates: Coordinates, date: Date, calculationParameters: CalculationParameters);
    timeForPrayer(prayer: ValueOf<typeof Prayer>): Date | null;
    currentPrayer(date?: Date): "none" | "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";
    nextPrayer(date?: Date): "none" | "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";
}
