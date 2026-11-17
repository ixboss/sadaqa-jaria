import type Coordinates from './Coordinates.js';
import SolarCoordinates from './SolarCoordinates.js';
export default class SolarTime {
    observer: Coordinates;
    solar: SolarCoordinates;
    prevSolar: SolarCoordinates;
    nextSolar: SolarCoordinates;
    approxTransit: number;
    transit: number;
    sunrise: number;
    sunset: number;
    constructor(date: Date, coordinates: Coordinates);
    hourAngle(angle: number, afterTransit: boolean): number;
    afternoon(shadowLength: number): number;
}
