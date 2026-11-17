import Coordinates from './Coordinates.js';
import SolarTime from './SolarTime.js';
import { ValueOf } from './TypeUtils.js';
export declare const PolarCircleResolution: {
    readonly AqrabBalad: "AqrabBalad";
    readonly AqrabYaum: "AqrabYaum";
    readonly Unresolved: "Unresolved";
};
export declare const polarCircleResolvedValues: (resolver: ValueOf<typeof PolarCircleResolution>, date: Date, coordinates: Coordinates) => {
    date: Date;
    tomorrow: Date;
    coordinates: Coordinates;
    solarTime: SolarTime;
    tomorrowSolarTime: SolarTime;
};
