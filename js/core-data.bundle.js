// ============================================================================
// core-data.bundle.js — GENERATED from packages/core-data/engines (prayer.js,
// qibla.js + vendored adhan 4.4.6). DO NOT HAND-EDIT.
//   Regenerate: node scripts/tools/build-engines-bundle.mjs
// Freshness is enforced: tests/parity/verify-parity.mjs re-compiles and
// compares bytes, so an engine edit without regeneration fails CI.
// Purpose: the v1 PWA (classic scripts) consumes the SAME golden v2 engines
// as web-desktop/Electron/iOS/Android via window.CoreData (2026-11 audit
// finding 14 — the parallel v1 math was the source of the device-tz bug).
// ============================================================================
(function () {
  'use strict';
  var __registry = {};
  var __define = function (key, depKeys, factory) {
    var __deps = {};
    for (var i = 0; i < depKeys.length; i++) __deps[depKeys[i]] = __registry[depKeys[i]];
    var m = {};
    factory(m, __deps);
    __registry[key] = m;
  };

__define("packages/core-data/vendor/adhan/Madhab.js", [], function (exports, __deps) {
const Madhab = {
  Shafi: 'shafi',
  Hanafi: 'hanafi'
};
function shadowLength(madhab) {
  switch (madhab) {
    case Madhab.Shafi:
      return 1;
    case Madhab.Hanafi:
      return 2;
    default:
      throw 'Invalid Madhab';
  }
}
//# sourceMappingURL=Madhab.js.map
  exports["Madhab"] = Madhab;
  exports["shadowLength"] = shadowLength;
});

__define("packages/core-data/vendor/adhan/HighLatitudeRule.js", [], function (exports, __deps) {
const HighLatitudeRule = {
  MiddleOfTheNight: 'middleofthenight',
  SeventhOfTheNight: 'seventhofthenight',
  TwilightAngle: 'twilightangle',
  recommended(coordinates) {
    if (coordinates.latitude > 48) {
      return HighLatitudeRule.SeventhOfTheNight;
    } else {
      return HighLatitudeRule.MiddleOfTheNight;
    }
  }
};

//# sourceMappingURL=HighLatitudeRule.js.map
  exports.default = HighLatitudeRule;
});

__define("packages/core-data/vendor/adhan/Coordinates.js", [], function (exports, __deps) {
class Coordinates {
  constructor(latitude, longitude) {
    this.latitude = latitude;
    this.longitude = longitude;
  }
}
//# sourceMappingURL=Coordinates.js.map
  exports.default = Coordinates;
});

__define("packages/core-data/vendor/adhan/Rounding.js", [], function (exports, __deps) {
const Rounding = {
  Nearest: 'nearest',
  Up: 'up',
  None: 'none'
};
//# sourceMappingURL=Rounding.js.map
  exports["Rounding"] = Rounding;
});

__define("packages/core-data/vendor/adhan/DateUtils.js", ["packages/core-data/vendor/adhan/Rounding.js"], function (exports, __deps) {
  const { Rounding } = __deps["packages/core-data/vendor/adhan/Rounding.js"];
function dateByAddingDays(date, days) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate() + days;
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  return new Date(year, month, day, hours, minutes, seconds);
}
function dateByAddingMinutes(date, minutes) {
  return dateByAddingSeconds(date, minutes * 60);
}
function dateByAddingSeconds(date, seconds) {
  return new Date(date.getTime() + seconds * 1000);
}
function roundedMinute(date, rounding = Rounding.Nearest) {
  const seconds = date.getUTCSeconds();
  let offset = seconds >= 30 ? 60 - seconds : -1 * seconds;
  if (rounding === Rounding.Up) {
    offset = 60 - seconds;
  } else if (rounding === Rounding.None) {
    offset = 0;
  }
  return dateByAddingSeconds(date, offset);
}

/* Whether or not a year is a leap year (has 366 days). */
function isLeapYear(year) {
  if (year % 4 !== 0) {
    return false;
  }
  if (year % 100 === 0 && year % 400 !== 0) {
    return false;
  }
  return true;
}
function dayOfYear(date) {
  let returnedDayOfYear = 0;
  const feb = isLeapYear(date.getFullYear()) ? 29 : 28;
  const months = [31, feb, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  for (let i = 0; i < date.getMonth(); i++) {
    returnedDayOfYear += months[i];
  }
  returnedDayOfYear += date.getDate();
  return returnedDayOfYear;
}
function isValidDate(date) {
  return date instanceof Date && !isNaN(date.valueOf());
}
//# sourceMappingURL=DateUtils.js.map
  exports["dateByAddingDays"] = dateByAddingDays;
  exports["dateByAddingMinutes"] = dateByAddingMinutes;
  exports["dateByAddingSeconds"] = dateByAddingSeconds;
  exports["roundedMinute"] = roundedMinute;
  exports["isLeapYear"] = isLeapYear;
  exports["dayOfYear"] = dayOfYear;
  exports["isValidDate"] = isValidDate;
});

__define("packages/core-data/vendor/adhan/MathUtils.js", [], function (exports, __deps) {
function degreesToRadians(degrees) {
  return degrees * Math.PI / 180.0;
}
function radiansToDegrees(radians) {
  return radians * 180.0 / Math.PI;
}
function normalizeToScale(num, max) {
  return num - max * Math.floor(num / max);
}
function unwindAngle(angle) {
  return normalizeToScale(angle, 360.0);
}
function quadrantShiftAngle(angle) {
  if (angle >= -180 && angle <= 180) {
    return angle;
  }
  return angle - 360 * Math.round(angle / 360);
}
//# sourceMappingURL=MathUtils.js.map
  exports["degreesToRadians"] = degreesToRadians;
  exports["radiansToDegrees"] = radiansToDegrees;
  exports["normalizeToScale"] = normalizeToScale;
  exports["unwindAngle"] = unwindAngle;
  exports["quadrantShiftAngle"] = quadrantShiftAngle;
});

__define("packages/core-data/vendor/adhan/Shafaq.js", [], function (exports, __deps) {
// Shafaq is the twilight in the sky. Different madhabs define the appearance of
// twilight differently. These values are used by the MoonsightingComittee method
// for the different ways to calculate Isha.
const Shafaq = {
  // General is a combination of Ahmer and Abyad.
  General: 'general',
  // Ahmer means the twilight is the red glow in the sky. Used by the Shafi, Maliki, and Hanbali madhabs.
  Ahmer: 'ahmer',
  // Abyad means the twilight is the white glow in the sky. Used by the Hanafi madhab.
  Abyad: 'abyad'
};
//# sourceMappingURL=Shafaq.js.map
  exports["Shafaq"] = Shafaq;
});

__define("packages/core-data/vendor/adhan/Astronomical.js", ["packages/core-data/vendor/adhan/DateUtils.js", "packages/core-data/vendor/adhan/MathUtils.js", "packages/core-data/vendor/adhan/Shafaq.js"], function (exports, __deps) {
  const { dateByAddingSeconds, isLeapYear } = __deps["packages/core-data/vendor/adhan/DateUtils.js"];
  const { degreesToRadians, normalizeToScale, quadrantShiftAngle, radiansToDegrees, unwindAngle } = __deps["packages/core-data/vendor/adhan/MathUtils.js"];
  const { Shafaq } = __deps["packages/core-data/vendor/adhan/Shafaq.js"];
const Astronomical = {
  /* The geometric mean longitude of the sun in degrees. */
  meanSolarLongitude(julianCentury) {
    const T = julianCentury;
    /* Equation from Astronomical Algorithms page 163 */
    const term1 = 280.4664567;
    const term2 = 36000.76983 * T;
    const term3 = 0.0003032 * Math.pow(T, 2);
    const L0 = term1 + term2 + term3;
    return unwindAngle(L0);
  },
  /* The geometric mean longitude of the moon in degrees. */
  meanLunarLongitude(julianCentury) {
    const T = julianCentury;
    /* Equation from Astronomical Algorithms page 144 */
    const term1 = 218.3165;
    const term2 = 481267.8813 * T;
    const Lp = term1 + term2;
    return unwindAngle(Lp);
  },
  ascendingLunarNodeLongitude(julianCentury) {
    const T = julianCentury;
    /* Equation from Astronomical Algorithms page 144 */
    const term1 = 125.04452;
    const term2 = 1934.136261 * T;
    const term3 = 0.0020708 * Math.pow(T, 2);
    const term4 = Math.pow(T, 3) / 450000;
    const Omega = term1 - term2 + term3 + term4;
    return unwindAngle(Omega);
  },
  /* The mean anomaly of the sun. */
  meanSolarAnomaly(julianCentury) {
    const T = julianCentury;
    /* Equation from Astronomical Algorithms page 163 */
    const term1 = 357.52911;
    const term2 = 35999.05029 * T;
    const term3 = 0.0001537 * Math.pow(T, 2);
    const M = term1 + term2 - term3;
    return unwindAngle(M);
  },
  /* The Sun's equation of the center in degrees. */
  solarEquationOfTheCenter(julianCentury, meanAnomaly) {
    const T = julianCentury;
    /* Equation from Astronomical Algorithms page 164 */
    const Mrad = degreesToRadians(meanAnomaly);
    const term1 = (1.914602 - 0.004817 * T - 0.000014 * Math.pow(T, 2)) * Math.sin(Mrad);
    const term2 = (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad);
    const term3 = 0.000289 * Math.sin(3 * Mrad);
    return term1 + term2 + term3;
  },
  /* The apparent longitude of the Sun, referred to the
        true equinox of the date. */
  apparentSolarLongitude(julianCentury, meanLongitude) {
    const T = julianCentury;
    const L0 = meanLongitude;
    /* Equation from Astronomical Algorithms page 164 */
    const longitude = L0 + Astronomical.solarEquationOfTheCenter(T, Astronomical.meanSolarAnomaly(T));
    const Omega = 125.04 - 1934.136 * T;
    const Lambda = longitude - 0.00569 - 0.00478 * Math.sin(degreesToRadians(Omega));
    return unwindAngle(Lambda);
  },
  /* The mean obliquity of the ecliptic, formula
        adopted by the International Astronomical Union.
        Represented in degrees. */
  meanObliquityOfTheEcliptic(julianCentury) {
    const T = julianCentury;
    /* Equation from Astronomical Algorithms page 147 */
    const term1 = 23.439291;
    const term2 = 0.013004167 * T;
    const term3 = 0.0000001639 * Math.pow(T, 2);
    const term4 = 0.0000005036 * Math.pow(T, 3);
    return term1 - term2 - term3 + term4;
  },
  /* The mean obliquity of the ecliptic, corrected for
        calculating the apparent position of the sun, in degrees. */
  apparentObliquityOfTheEcliptic(julianCentury, meanObliquityOfTheEcliptic) {
    const T = julianCentury;
    const Epsilon0 = meanObliquityOfTheEcliptic;
    /* Equation from Astronomical Algorithms page 165 */
    const O = 125.04 - 1934.136 * T;
    return Epsilon0 + 0.00256 * Math.cos(degreesToRadians(O));
  },
  /* Mean sidereal time, the hour angle of the vernal equinox, in degrees. */
  meanSiderealTime(julianCentury) {
    const T = julianCentury;
    /* Equation from Astronomical Algorithms page 165 */
    const JD = T * 36525 + 2451545.0;
    const term1 = 280.46061837;
    const term2 = 360.98564736629 * (JD - 2451545);
    const term3 = 0.000387933 * Math.pow(T, 2);
    const term4 = Math.pow(T, 3) / 38710000;
    const Theta = term1 + term2 + term3 - term4;
    return unwindAngle(Theta);
  },
  nutationInLongitude(julianCentury, solarLongitude, lunarLongitude, ascendingNode) {
    const L0 = solarLongitude;
    const Lp = lunarLongitude;
    const Omega = ascendingNode;
    /* Equation from Astronomical Algorithms page 144 */
    const term1 = -17.2 / 3600 * Math.sin(degreesToRadians(Omega));
    const term2 = 1.32 / 3600 * Math.sin(2 * degreesToRadians(L0));
    const term3 = 0.23 / 3600 * Math.sin(2 * degreesToRadians(Lp));
    const term4 = 0.21 / 3600 * Math.sin(2 * degreesToRadians(Omega));
    return term1 - term2 - term3 + term4;
  },
  nutationInObliquity(julianCentury, solarLongitude, lunarLongitude, ascendingNode) {
    const L0 = solarLongitude;
    const Lp = lunarLongitude;
    const Omega = ascendingNode;
    /* Equation from Astronomical Algorithms page 144 */
    const term1 = 9.2 / 3600 * Math.cos(degreesToRadians(Omega));
    const term2 = 0.57 / 3600 * Math.cos(2 * degreesToRadians(L0));
    const term3 = 0.1 / 3600 * Math.cos(2 * degreesToRadians(Lp));
    const term4 = 0.09 / 3600 * Math.cos(2 * degreesToRadians(Omega));
    return term1 + term2 + term3 - term4;
  },
  altitudeOfCelestialBody(observerLatitude, declination, localHourAngle) {
    const Phi = observerLatitude;
    const delta = declination;
    const H = localHourAngle;
    /* Equation from Astronomical Algorithms page 93 */
    const term1 = Math.sin(degreesToRadians(Phi)) * Math.sin(degreesToRadians(delta));
    const term2 = Math.cos(degreesToRadians(Phi)) * Math.cos(degreesToRadians(delta)) * Math.cos(degreesToRadians(H));
    return radiansToDegrees(Math.asin(term1 + term2));
  },
  approximateTransit(longitude, siderealTime, rightAscension) {
    const L = longitude;
    const Theta0 = siderealTime;
    const a2 = rightAscension;
    /* Equation from page Astronomical Algorithms 102 */
    const Lw = L * -1;
    const m0 = normalizeToScale((a2 + Lw - Theta0) / 360, 1);
    // For locations near the International Date Line, normalizeWithBound can produce
    // an m0 for the wrong calendar date.  We detect this by comparing m0 to a
    // generalized transit time based on the longitude. If they differ by more than
    // half a day, m0 is off by one cycle and we adjust in the correct direction.
    const expectedTransit = normalizeToScale((12.0 - L / 15.0) / 24.0, 1);
    if (m0 - expectedTransit > 0.5) {
      return m0 - 1.0;
    } else if (expectedTransit - m0 > 0.5) {
      return m0 + 1.0;
    } else {
      return m0;
    }
  },
  /* The time at which the sun is at its highest point in the sky (in universal time) */
  correctedTransit(approximateTransit, longitude, siderealTime, rightAscension, previousRightAscension, nextRightAscension) {
    const m0 = approximateTransit;
    const L = longitude;
    const Theta0 = siderealTime;
    const a2 = rightAscension;
    const a1 = previousRightAscension;
    const a3 = nextRightAscension;
    /* Equation from page Astronomical Algorithms 102 */
    const Lw = L * -1;
    const Theta = unwindAngle(Theta0 + 360.985647 * m0);
    const a = unwindAngle(Astronomical.interpolateAngles(a2, a1, a3, m0));
    const H = quadrantShiftAngle(Theta - Lw - a);
    const dm = H / -360;
    return (m0 + dm) * 24;
  },
  correctedHourAngle(approximateTransit, angle, coordinates, afterTransit, siderealTime, rightAscension, previousRightAscension, nextRightAscension, declination, previousDeclination, nextDeclination) {
    const m0 = approximateTransit;
    const h0 = angle;
    const Theta0 = siderealTime;
    const a2 = rightAscension;
    const a1 = previousRightAscension;
    const a3 = nextRightAscension;
    const d2 = declination;
    const d1 = previousDeclination;
    const d3 = nextDeclination;

    /* Equation from page Astronomical Algorithms 102 */
    const Lw = coordinates.longitude * -1;
    const term1 = Math.sin(degreesToRadians(h0)) - Math.sin(degreesToRadians(coordinates.latitude)) * Math.sin(degreesToRadians(d2));
    const term2 = Math.cos(degreesToRadians(coordinates.latitude)) * Math.cos(degreesToRadians(d2));
    const H0 = radiansToDegrees(Math.acos(term1 / term2));
    const m = afterTransit ? m0 + H0 / 360 : m0 - H0 / 360;
    const Theta = unwindAngle(Theta0 + 360.985647 * m);
    const a = unwindAngle(Astronomical.interpolateAngles(a2, a1, a3, m));
    const delta = Astronomical.interpolate(d2, d1, d3, m);
    const H = Theta - Lw - a;
    const h = Astronomical.altitudeOfCelestialBody(coordinates.latitude, delta, H);
    const term3 = h - h0;
    const term4 = 360 * Math.cos(degreesToRadians(delta)) * Math.cos(degreesToRadians(coordinates.latitude)) * Math.sin(degreesToRadians(H));
    const dm = term3 / term4;
    return (m + dm) * 24;
  },
  /* Interpolation of a value given equidistant
        previous and next values and a factor
        equal to the fraction of the interpolated
        point's time over the time between values. */
  interpolate(y2, y1, y3, n) {
    /* Equation from Astronomical Algorithms page 24 */
    const a = y2 - y1;
    const b = y3 - y2;
    const c = b - a;
    return y2 + n / 2 * (a + b + n * c);
  },
  /* Interpolation of three angles, accounting for
        angle unwinding. */
  interpolateAngles(y2, y1, y3, n) {
    /* Equation from Astronomical Algorithms page 24 */
    const a = unwindAngle(y2 - y1);
    const b = unwindAngle(y3 - y2);
    const c = b - a;
    return y2 + n / 2 * (a + b + n * c);
  },
  /* The Julian Day for the given Gregorian date components. */
  julianDay(year, month, day, hours = 0) {
    /* Equation from Astronomical Algorithms page 60 */

    const trunc = Math.trunc;
    const Y = trunc(month > 2 ? year : year - 1);
    const M = trunc(month > 2 ? month : month + 12);
    const D = day + hours / 24;
    const A = trunc(Y / 100);
    const B = trunc(2 - A + trunc(A / 4));
    const i0 = trunc(365.25 * (Y + 4716));
    const i1 = trunc(30.6001 * (M + 1));
    return i0 + i1 + D + B - 1524.5;
  },
  /* Julian century from the epoch. */
  julianCentury(julianDay) {
    /* Equation from Astronomical Algorithms page 163 */
    return (julianDay - 2451545.0) / 36525;
  },
  seasonAdjustedMorningTwilight(latitude, dayOfYear, year, sunrise) {
    const a = 75 + 28.65 / 55.0 * Math.abs(latitude);
    const b = 75 + 19.44 / 55.0 * Math.abs(latitude);
    const c = 75 + 32.74 / 55.0 * Math.abs(latitude);
    const d = 75 + 48.1 / 55.0 * Math.abs(latitude);
    const adjustment = function () {
      const dyy = Astronomical.daysSinceSolstice(dayOfYear, year, latitude);
      if (dyy < 91) {
        return a + (b - a) / 91.0 * dyy;
      } else if (dyy < 137) {
        return b + (c - b) / 46.0 * (dyy - 91);
      } else if (dyy < 183) {
        return c + (d - c) / 46.0 * (dyy - 137);
      } else if (dyy < 229) {
        return d + (c - d) / 46.0 * (dyy - 183);
      } else if (dyy < 275) {
        return c + (b - c) / 46.0 * (dyy - 229);
      } else {
        return b + (a - b) / 91.0 * (dyy - 275);
      }
    }();
    return dateByAddingSeconds(sunrise, Math.round(adjustment * -60.0));
  },
  seasonAdjustedEveningTwilight(latitude, dayOfYear, year, sunset, shafaq) {
    let a, b, c, d;
    if (shafaq === Shafaq.Ahmer) {
      a = 62 + 17.4 / 55.0 * Math.abs(latitude);
      b = 62 - 7.16 / 55.0 * Math.abs(latitude);
      c = 62 + 5.12 / 55.0 * Math.abs(latitude);
      d = 62 + 19.44 / 55.0 * Math.abs(latitude);
    } else if (shafaq === Shafaq.Abyad) {
      a = 75 + 25.6 / 55.0 * Math.abs(latitude);
      b = 75 + 7.16 / 55.0 * Math.abs(latitude);
      c = 75 + 36.84 / 55.0 * Math.abs(latitude);
      d = 75 + 81.84 / 55.0 * Math.abs(latitude);
    } else {
      a = 75 + 25.6 / 55.0 * Math.abs(latitude);
      b = 75 + 2.05 / 55.0 * Math.abs(latitude);
      c = 75 - 9.21 / 55.0 * Math.abs(latitude);
      d = 75 + 6.14 / 55.0 * Math.abs(latitude);
    }
    const adjustment = function () {
      const dyy = Astronomical.daysSinceSolstice(dayOfYear, year, latitude);
      if (dyy < 91) {
        return a + (b - a) / 91.0 * dyy;
      } else if (dyy < 137) {
        return b + (c - b) / 46.0 * (dyy - 91);
      } else if (dyy < 183) {
        return c + (d - c) / 46.0 * (dyy - 137);
      } else if (dyy < 229) {
        return d + (c - d) / 46.0 * (dyy - 183);
      } else if (dyy < 275) {
        return c + (b - c) / 46.0 * (dyy - 229);
      } else {
        return b + (a - b) / 91.0 * (dyy - 275);
      }
    }();
    return dateByAddingSeconds(sunset, Math.round(adjustment * 60.0));
  },
  daysSinceSolstice(dayOfYear, year, latitude) {
    let daysSinceSolstice;
    const northernOffset = 10;
    const southernOffset = isLeapYear(year) ? 173 : 172;
    const daysInYear = isLeapYear(year) ? 366 : 365;
    if (latitude >= 0) {
      daysSinceSolstice = dayOfYear + northernOffset;
      if (daysSinceSolstice >= daysInYear) {
        daysSinceSolstice = daysSinceSolstice - daysInYear;
      }
    } else {
      daysSinceSolstice = dayOfYear - southernOffset;
      if (daysSinceSolstice < 0) {
        daysSinceSolstice = daysSinceSolstice + daysInYear;
      }
    }
    return daysSinceSolstice;
  }
};

//# sourceMappingURL=Astronomical.js.map
  exports.default = Astronomical;
});

__define("packages/core-data/vendor/adhan/SolarCoordinates.js", ["packages/core-data/vendor/adhan/Astronomical.js", "packages/core-data/vendor/adhan/MathUtils.js"], function (exports, __deps) {
  const { default: Astronomical } = __deps["packages/core-data/vendor/adhan/Astronomical.js"];
  const { degreesToRadians, radiansToDegrees, unwindAngle } = __deps["packages/core-data/vendor/adhan/MathUtils.js"];
class SolarCoordinates {
  constructor(julianDay) {
    const T = Astronomical.julianCentury(julianDay);
    const L0 = Astronomical.meanSolarLongitude(T);
    const Lp = Astronomical.meanLunarLongitude(T);
    const Omega = Astronomical.ascendingLunarNodeLongitude(T);
    const Lambda = degreesToRadians(Astronomical.apparentSolarLongitude(T, L0));
    const Theta0 = Astronomical.meanSiderealTime(T);
    const dPsi = Astronomical.nutationInLongitude(T, L0, Lp, Omega);
    const dEpsilon = Astronomical.nutationInObliquity(T, L0, Lp, Omega);
    const Epsilon0 = Astronomical.meanObliquityOfTheEcliptic(T);
    const EpsilonApparent = degreesToRadians(Astronomical.apparentObliquityOfTheEcliptic(T, Epsilon0));

    /* declination: The declination of the sun, the angle between
            the rays of the Sun and the plane of the Earth's
            equator, in degrees.
            Equation from Astronomical Algorithms page 165 */
    this.declination = radiansToDegrees(Math.asin(Math.sin(EpsilonApparent) * Math.sin(Lambda)));

    /* rightAscension: Right ascension of the Sun, the angular distance on the
            celestial equator from the vernal equinox to the hour circle,
            in degrees.
            Equation from Astronomical Algorithms page 165 */
    this.rightAscension = unwindAngle(radiansToDegrees(Math.atan2(Math.cos(EpsilonApparent) * Math.sin(Lambda), Math.cos(Lambda))));

    /* apparentSiderealTime: Apparent sidereal time, the hour angle of the vernal
            equinox, in degrees.
            Equation from Astronomical Algorithms page 88 */
    this.apparentSiderealTime = Theta0 + dPsi * 3600 * Math.cos(degreesToRadians(Epsilon0 + dEpsilon)) / 3600;
  }
}
//# sourceMappingURL=SolarCoordinates.js.map
  exports.default = SolarCoordinates;
});

__define("packages/core-data/vendor/adhan/SolarTime.js", ["packages/core-data/vendor/adhan/Astronomical.js", "packages/core-data/vendor/adhan/MathUtils.js", "packages/core-data/vendor/adhan/SolarCoordinates.js"], function (exports, __deps) {
  const { default: Astronomical } = __deps["packages/core-data/vendor/adhan/Astronomical.js"];
  const { degreesToRadians, radiansToDegrees } = __deps["packages/core-data/vendor/adhan/MathUtils.js"];
  const { default: SolarCoordinates } = __deps["packages/core-data/vendor/adhan/SolarCoordinates.js"];
class SolarTime {
  constructor(date, coordinates) {
    const julianDay = Astronomical.julianDay(date.getFullYear(), date.getMonth() + 1, date.getDate(), 0);
    this.observer = coordinates;
    this.solar = new SolarCoordinates(julianDay);
    this.prevSolar = new SolarCoordinates(julianDay - 1);
    this.nextSolar = new SolarCoordinates(julianDay + 1);
    const m0 = Astronomical.approximateTransit(coordinates.longitude, this.solar.apparentSiderealTime, this.solar.rightAscension);
    const solarAltitude = -50.0 / 60.0;
    this.approxTransit = m0;
    this.transit = Astronomical.correctedTransit(m0, coordinates.longitude, this.solar.apparentSiderealTime, this.solar.rightAscension, this.prevSolar.rightAscension, this.nextSolar.rightAscension);
    this.sunrise = Astronomical.correctedHourAngle(m0, solarAltitude, coordinates, false, this.solar.apparentSiderealTime, this.solar.rightAscension, this.prevSolar.rightAscension, this.nextSolar.rightAscension, this.solar.declination, this.prevSolar.declination, this.nextSolar.declination);
    this.sunset = Astronomical.correctedHourAngle(m0, solarAltitude, coordinates, true, this.solar.apparentSiderealTime, this.solar.rightAscension, this.prevSolar.rightAscension, this.nextSolar.rightAscension, this.solar.declination, this.prevSolar.declination, this.nextSolar.declination);
  }
  hourAngle(angle, afterTransit) {
    return Astronomical.correctedHourAngle(this.approxTransit, angle, this.observer, afterTransit, this.solar.apparentSiderealTime, this.solar.rightAscension, this.prevSolar.rightAscension, this.nextSolar.rightAscension, this.solar.declination, this.prevSolar.declination, this.nextSolar.declination);
  }
  afternoon(shadowLength) {
    // TODO source shadow angle calculation
    const tangent = Math.abs(this.observer.latitude - this.solar.declination);
    const inverse = shadowLength + Math.tan(degreesToRadians(tangent));
    const angle = radiansToDegrees(Math.atan(1.0 / inverse));
    return this.hourAngle(angle, true);
  }
}
//# sourceMappingURL=SolarTime.js.map
  exports.default = SolarTime;
});

__define("packages/core-data/vendor/adhan/PolarCircleResolution.js", ["packages/core-data/vendor/adhan/Coordinates.js", "packages/core-data/vendor/adhan/SolarTime.js", "packages/core-data/vendor/adhan/DateUtils.js"], function (exports, __deps) {
  const { default: Coordinates } = __deps["packages/core-data/vendor/adhan/Coordinates.js"];
  const { default: SolarTime } = __deps["packages/core-data/vendor/adhan/SolarTime.js"];
  const { dateByAddingDays } = __deps["packages/core-data/vendor/adhan/DateUtils.js"];
const PolarCircleResolution = {
  AqrabBalad: 'AqrabBalad',
  AqrabYaum: 'AqrabYaum',
  Unresolved: 'Unresolved'
};
const LATITUDE_VARIATION_STEP = 0.5; // Degrees to add/remove at each resolution step
const UNSAFE_LATITUDE = 65; // Based on https://en.wikipedia.org/wiki/Midnight_sun

const isValidSolarTime = solarTime => !isNaN(solarTime.sunrise) && !isNaN(solarTime.sunset);
const aqrabYaumResolver = (coordinates, date, daysAdded = 1, direction = 1) => {
  if (daysAdded > Math.ceil(365 / 2)) {
    return null;
  }
  const testDate = new Date(date.getTime());
  testDate.setDate(testDate.getDate() + direction * daysAdded);
  const tomorrow = dateByAddingDays(testDate, 1);
  const solarTime = new SolarTime(testDate, coordinates);
  const tomorrowSolarTime = new SolarTime(tomorrow, coordinates);
  if (!isValidSolarTime(solarTime) || !isValidSolarTime(tomorrowSolarTime)) {
    return aqrabYaumResolver(coordinates, date, daysAdded + (direction > 0 ? 0 : 1), -direction);
  }
  return {
    date,
    tomorrow,
    coordinates,
    solarTime,
    tomorrowSolarTime
  };
};
const aqrabBaladResolver = (coordinates, date, latitude) => {
  const solarTime = new SolarTime(date, {
    ...coordinates,
    latitude
  });
  const tomorrow = dateByAddingDays(date, 1);
  const tomorrowSolarTime = new SolarTime(tomorrow, {
    ...coordinates,
    latitude
  });
  if (!isValidSolarTime(solarTime) || !isValidSolarTime(tomorrowSolarTime)) {
    return Math.abs(latitude) >= UNSAFE_LATITUDE ? aqrabBaladResolver(coordinates, date, latitude - Math.sign(latitude) * LATITUDE_VARIATION_STEP) : null;
  }
  return {
    date,
    tomorrow,
    coordinates: new Coordinates(latitude, coordinates.longitude),
    solarTime,
    tomorrowSolarTime
  };
};
const polarCircleResolvedValues = (resolver, date, coordinates) => {
  const defaultReturn = {
    date,
    tomorrow: dateByAddingDays(date, 1),
    coordinates,
    solarTime: new SolarTime(date, coordinates),
    tomorrowSolarTime: new SolarTime(dateByAddingDays(date, 1), coordinates)
  };
  switch (resolver) {
    case PolarCircleResolution.AqrabYaum:
      {
        return aqrabYaumResolver(coordinates, date) || defaultReturn;
      }
    case PolarCircleResolution.AqrabBalad:
      {
        const {
          latitude
        } = coordinates;
        return aqrabBaladResolver(coordinates, date, latitude - Math.sign(latitude) * LATITUDE_VARIATION_STEP) || defaultReturn;
      }
    default:
      {
        return defaultReturn;
      }
  }
};
//# sourceMappingURL=PolarCircleResolution.js.map
  exports["PolarCircleResolution"] = PolarCircleResolution;
  exports["polarCircleResolvedValues"] = polarCircleResolvedValues;
});

__define("packages/core-data/vendor/adhan/CalculationParameters.js", ["packages/core-data/vendor/adhan/Madhab.js", "packages/core-data/vendor/adhan/HighLatitudeRule.js", "packages/core-data/vendor/adhan/PolarCircleResolution.js", "packages/core-data/vendor/adhan/Rounding.js", "packages/core-data/vendor/adhan/Shafaq.js"], function (exports, __deps) {
  const { Madhab } = __deps["packages/core-data/vendor/adhan/Madhab.js"];
  const { default: HighLatitudeRule } = __deps["packages/core-data/vendor/adhan/HighLatitudeRule.js"];
  const { PolarCircleResolution } = __deps["packages/core-data/vendor/adhan/PolarCircleResolution.js"];
  const { Rounding } = __deps["packages/core-data/vendor/adhan/Rounding.js"];
  const { Shafaq } = __deps["packages/core-data/vendor/adhan/Shafaq.js"];
class CalculationParameters {
  // Madhab to determine how Asr is calculated.
  madhab = Madhab.Shafi;

  // Rule to determine the earliest time for Fajr and latest time for Isha
  // needed for high latitude locations where Fajr and Isha may not truly exist
  // or may present a hardship unless bound to a reasonable time.
  highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;

  // Manual adjustments (in minutes) to be added to each prayer time.
  adjustments = {
    fajr: 0,
    sunrise: 0,
    dhuhr: 0,
    asr: 0,
    maghrib: 0,
    isha: 0
  };

  // Adjustments set by a calculation method. This value should not be manually modified.
  methodAdjustments = {
    fajr: 0,
    sunrise: 0,
    dhuhr: 0,
    asr: 0,
    maghrib: 0,
    isha: 0
  };

  // Rule to determine how to resolve prayer times inside the Polar Circle
  // where daylight or night may persist for more than 24 hours depending
  // on the season
  polarCircleResolution = PolarCircleResolution.Unresolved;

  // How seconds are rounded when calculating prayer times
  rounding = Rounding.Nearest;

  // Used by the MoonsightingCommittee method to determine how to calculate Isha
  shafaq = Shafaq.General;
  constructor(
  // Name of the method, can be used to apply special behavior in calculations.
  // This property should not be manually modified.
  method,
  // Angle of the sun below the horizon used for calculating Fajr.
  fajrAngle = 0,
  // Angle of the sun below the horizon used for calculating Isha.
  ishaAngle = 0,
  // Minutes after Maghrib to determine time for Isha
  // if this value is greater than 0 then ishaAngle is not used.
  ishaInterval = 0,
  // Angle of the sun below the horizon used for calculating Maghrib.
  // Only used by the Tehran method to account for lightness in the sky.
  maghribAngle = 0) {
    this.method = method;
    this.fajrAngle = fajrAngle;
    this.ishaAngle = ishaAngle;
    this.ishaInterval = ishaInterval;
    this.maghribAngle = maghribAngle;
    if (this.method === null) {
      // we don't want a breaking change
      this.method = 'Other';
    }
  }
  nightPortions() {
    switch (this.highLatitudeRule) {
      case HighLatitudeRule.MiddleOfTheNight:
        return {
          fajr: 1 / 2,
          isha: 1 / 2
        };
      case HighLatitudeRule.SeventhOfTheNight:
        return {
          fajr: 1 / 7,
          isha: 1 / 7
        };
      case HighLatitudeRule.TwilightAngle:
        return {
          fajr: this.fajrAngle / 60,
          isha: this.ishaAngle / 60
        };
      default:
        throw `Invalid high latitude rule found when attempting to compute night portions: ${this.highLatitudeRule}`;
    }
  }
}
//# sourceMappingURL=CalculationParameters.js.map
  exports.default = CalculationParameters;
});

__define("packages/core-data/vendor/adhan/CalculationMethod.js", ["packages/core-data/vendor/adhan/CalculationParameters.js", "packages/core-data/vendor/adhan/Rounding.js"], function (exports, __deps) {
  const { default: CalculationParameters } = __deps["packages/core-data/vendor/adhan/CalculationParameters.js"];
  const { Rounding } = __deps["packages/core-data/vendor/adhan/Rounding.js"];
const CalculationMethod = {
  // Muslim World League
  MuslimWorldLeague() {
    const params = new CalculationParameters('MuslimWorldLeague', 18, 17);
    params.methodAdjustments.dhuhr = 1;
    return params;
  },
  // Egyptian General Authority of Survey
  Egyptian() {
    const params = new CalculationParameters('Egyptian', 19.5, 17.5);
    params.methodAdjustments.dhuhr = 1;
    return params;
  },
  // University of Islamic Sciences, Karachi
  Karachi() {
    const params = new CalculationParameters('Karachi', 18, 18);
    params.methodAdjustments.dhuhr = 1;
    return params;
  },
  // Umm al-Qura University, Makkah
  UmmAlQura() {
    return new CalculationParameters('UmmAlQura', 18.5, 0, 90);
  },
  // Dubai
  Dubai() {
    const params = new CalculationParameters('Dubai', 18.2, 18.2);
    params.methodAdjustments = {
      ...params.methodAdjustments,
      sunrise: -3,
      dhuhr: 3,
      asr: 3,
      maghrib: 3
    };
    return params;
  },
  // Moonsighting Committee
  MoonsightingCommittee() {
    const params = new CalculationParameters('MoonsightingCommittee', 18, 18);
    params.methodAdjustments = {
      ...params.methodAdjustments,
      dhuhr: 5,
      maghrib: 3
    };
    return params;
  },
  // ISNA
  NorthAmerica() {
    const params = new CalculationParameters('NorthAmerica', 15, 15);
    params.methodAdjustments.dhuhr = 1;
    return params;
  },
  // Kuwait
  Kuwait() {
    return new CalculationParameters('Kuwait', 18, 17.5);
  },
  // Qatar
  Qatar() {
    return new CalculationParameters('Qatar', 18, 0, 90);
  },
  // Singapore
  Singapore() {
    const params = new CalculationParameters('Singapore', 20, 18);
    params.methodAdjustments.dhuhr = 1;
    params.rounding = Rounding.Up;
    return params;
  },
  // Institute of Geophysics, University of Tehran
  Tehran() {
    const params = new CalculationParameters('Tehran', 17.7, 14, 0, 4.5);
    return params;
  },
  // Dianet
  Turkey() {
    const params = new CalculationParameters('Turkey', 18, 17);
    params.methodAdjustments = {
      ...params.methodAdjustments,
      sunrise: -7,
      dhuhr: 5,
      asr: 4,
      maghrib: 7
    };
    return params;
  },
  // Other
  Other() {
    return new CalculationParameters('Other', 0, 0);
  }
};

//# sourceMappingURL=CalculationMethod.js.map
  exports.default = CalculationMethod;
});

__define("packages/core-data/vendor/adhan/Prayer.js", [], function (exports, __deps) {
const Prayer = {
  Fajr: 'fajr',
  Sunrise: 'sunrise',
  Dhuhr: 'dhuhr',
  Asr: 'asr',
  Maghrib: 'maghrib',
  Isha: 'isha',
  None: 'none'
};

//# sourceMappingURL=Prayer.js.map
  exports.default = Prayer;
});

__define("packages/core-data/vendor/adhan/TimeComponents.js", [], function (exports, __deps) {
class TimeComponents {
  constructor(num) {
    this.hours = Math.floor(num);
    this.minutes = Math.floor((num - this.hours) * 60);
    this.seconds = Math.floor((num - (this.hours + this.minutes / 60)) * 60 * 60);
    return this;
  }
  utcDate(year, month, date) {
    return new Date(Date.UTC(year, month, date, this.hours, this.minutes, this.seconds));
  }
}
//# sourceMappingURL=TimeComponents.js.map
  exports.default = TimeComponents;
});

__define("packages/core-data/vendor/adhan/PrayerTimes.js", ["packages/core-data/vendor/adhan/SolarTime.js", "packages/core-data/vendor/adhan/TimeComponents.js", "packages/core-data/vendor/adhan/Prayer.js", "packages/core-data/vendor/adhan/Astronomical.js", "packages/core-data/vendor/adhan/DateUtils.js", "packages/core-data/vendor/adhan/Madhab.js", "packages/core-data/vendor/adhan/PolarCircleResolution.js"], function (exports, __deps) {
  const { default: SolarTime } = __deps["packages/core-data/vendor/adhan/SolarTime.js"];
  const { default: TimeComponents } = __deps["packages/core-data/vendor/adhan/TimeComponents.js"];
  const { default: Prayer } = __deps["packages/core-data/vendor/adhan/Prayer.js"];
  const { default: Astronomical } = __deps["packages/core-data/vendor/adhan/Astronomical.js"];
  const { dateByAddingDays, dateByAddingMinutes, dateByAddingSeconds, dayOfYear, isValidDate, roundedMinute } = __deps["packages/core-data/vendor/adhan/DateUtils.js"];
  const { shadowLength } = __deps["packages/core-data/vendor/adhan/Madhab.js"];
  const { PolarCircleResolution, polarCircleResolvedValues } = __deps["packages/core-data/vendor/adhan/PolarCircleResolution.js"];
// Moonsighting Committee applies a special 1/7 night-fraction rule at high
// latitudes (>= 55°), where angle-based Fajr/Isha may not exist.
const HIGH_LATITUDE_THRESHOLD = 55;
class PrayerTimes {
  constructor(coordinates, date, calculationParameters) {
    this.coordinates = coordinates;
    this.date = date;
    this.calculationParameters = calculationParameters;
    let solarTime = new SolarTime(date, coordinates);
    let fajrTime;
    let sunriseTime;
    let dhuhrTime;
    let asrTime;
    let sunsetTime;
    let maghribTime;
    let ishaTime;
    let nightFraction;
    dhuhrTime = new TimeComponents(solarTime.transit).utcDate(date.getFullYear(), date.getMonth(), date.getDate());
    sunriseTime = new TimeComponents(solarTime.sunrise).utcDate(date.getFullYear(), date.getMonth(), date.getDate());
    sunsetTime = new TimeComponents(solarTime.sunset).utcDate(date.getFullYear(), date.getMonth(), date.getDate());
    const tomorrow = dateByAddingDays(date, 1);
    let tomorrowSolarTime = new SolarTime(tomorrow, coordinates);
    const polarCircleResolver = calculationParameters.polarCircleResolution;
    if ((!isValidDate(sunriseTime) || !isValidDate(sunsetTime) || isNaN(tomorrowSolarTime.sunrise)) && polarCircleResolver !== PolarCircleResolution.Unresolved) {
      const resolved = polarCircleResolvedValues(polarCircleResolver, date, coordinates);
      solarTime = resolved.solarTime;
      tomorrowSolarTime = resolved.tomorrowSolarTime;
      const dateComponents = [date.getFullYear(), date.getMonth(), date.getDate()];
      dhuhrTime = new TimeComponents(solarTime.transit).utcDate(...dateComponents);
      sunriseTime = new TimeComponents(solarTime.sunrise).utcDate(...dateComponents);
      sunsetTime = new TimeComponents(solarTime.sunset).utcDate(...dateComponents);
    }

    // eslint-disable-next-line prefer-const
    asrTime = new TimeComponents(solarTime.afternoon(shadowLength(calculationParameters.madhab))).utcDate(date.getFullYear(), date.getMonth(), date.getDate());
    const tomorrowSunrise = new TimeComponents(tomorrowSolarTime.sunrise).utcDate(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const night = (Number(tomorrowSunrise) - Number(sunsetTime)) / 1000;
    fajrTime = new TimeComponents(solarTime.hourAngle(-1 * calculationParameters.fajrAngle, false)).utcDate(date.getFullYear(), date.getMonth(), date.getDate());

    // special case for moonsighting committee above latitude 55
    if (calculationParameters.method === 'MoonsightingCommittee' && coordinates.latitude >= HIGH_LATITUDE_THRESHOLD) {
      nightFraction = night / 7;
      fajrTime = dateByAddingSeconds(sunriseTime, -nightFraction);
    }
    const safeFajr = function () {
      if (calculationParameters.method === 'MoonsightingCommittee') {
        return Astronomical.seasonAdjustedMorningTwilight(coordinates.latitude, dayOfYear(date), date.getFullYear(), sunriseTime);
      } else {
        const portion = calculationParameters.nightPortions().fajr;
        nightFraction = portion * night;
        return dateByAddingSeconds(sunriseTime, -nightFraction);
      }
    }();
    if (isNaN(fajrTime.getTime()) || safeFajr > fajrTime) {
      fajrTime = safeFajr;
    }
    if (calculationParameters.ishaInterval > 0) {
      ishaTime = dateByAddingMinutes(sunsetTime, calculationParameters.ishaInterval);
    } else {
      ishaTime = new TimeComponents(solarTime.hourAngle(-1 * calculationParameters.ishaAngle, true)).utcDate(date.getFullYear(), date.getMonth(), date.getDate());

      // special case for moonsighting committee above latitude 55
      if (calculationParameters.method === 'MoonsightingCommittee' && coordinates.latitude >= HIGH_LATITUDE_THRESHOLD) {
        nightFraction = night / 7;
        ishaTime = dateByAddingSeconds(sunsetTime, nightFraction);
      }
      const safeIsha = function () {
        if (calculationParameters.method === 'MoonsightingCommittee') {
          return Astronomical.seasonAdjustedEveningTwilight(coordinates.latitude, dayOfYear(date), date.getFullYear(), sunsetTime, calculationParameters.shafaq);
        } else {
          const portion = calculationParameters.nightPortions().isha;
          nightFraction = portion * night;
          return dateByAddingSeconds(sunsetTime, nightFraction);
        }
      }();
      if (isNaN(ishaTime.getTime()) || safeIsha < ishaTime) {
        ishaTime = safeIsha;
      }
    }
    maghribTime = sunsetTime;
    if (calculationParameters.maghribAngle) {
      const angleBasedMaghrib = new TimeComponents(solarTime.hourAngle(-1 * calculationParameters.maghribAngle, true)).utcDate(date.getFullYear(), date.getMonth(), date.getDate());
      if (sunsetTime < angleBasedMaghrib && ishaTime > angleBasedMaghrib) {
        maghribTime = angleBasedMaghrib;
      }
    }
    const fajrAdjustment = (calculationParameters.adjustments.fajr || 0) + (calculationParameters.methodAdjustments.fajr || 0);
    const sunriseAdjustment = (calculationParameters.adjustments.sunrise || 0) + (calculationParameters.methodAdjustments.sunrise || 0);
    const dhuhrAdjustment = (calculationParameters.adjustments.dhuhr || 0) + (calculationParameters.methodAdjustments.dhuhr || 0);
    const asrAdjustment = (calculationParameters.adjustments.asr || 0) + (calculationParameters.methodAdjustments.asr || 0);
    const maghribAdjustment = (calculationParameters.adjustments.maghrib || 0) + (calculationParameters.methodAdjustments.maghrib || 0);
    const ishaAdjustment = (calculationParameters.adjustments.isha || 0) + (calculationParameters.methodAdjustments.isha || 0);
    this.fajr = roundedMinute(dateByAddingMinutes(fajrTime, fajrAdjustment), calculationParameters.rounding);
    this.sunrise = roundedMinute(dateByAddingMinutes(sunriseTime, sunriseAdjustment), calculationParameters.rounding);
    this.dhuhr = roundedMinute(dateByAddingMinutes(dhuhrTime, dhuhrAdjustment), calculationParameters.rounding);
    this.asr = roundedMinute(dateByAddingMinutes(asrTime, asrAdjustment), calculationParameters.rounding);
    this.sunset = roundedMinute(sunsetTime, calculationParameters.rounding);
    this.maghrib = roundedMinute(dateByAddingMinutes(maghribTime, maghribAdjustment), calculationParameters.rounding);
    this.isha = roundedMinute(dateByAddingMinutes(ishaTime, ishaAdjustment), calculationParameters.rounding);
  }
  timeForPrayer(prayer) {
    if (prayer === Prayer.Fajr) {
      return this.fajr;
    } else if (prayer === Prayer.Sunrise) {
      return this.sunrise;
    } else if (prayer === Prayer.Dhuhr) {
      return this.dhuhr;
    } else if (prayer === Prayer.Asr) {
      return this.asr;
    } else if (prayer === Prayer.Maghrib) {
      return this.maghrib;
    } else if (prayer === Prayer.Isha) {
      return this.isha;
    } else {
      return null;
    }
  }
  currentPrayer(date = new Date()) {
    if (date >= this.isha) {
      return Prayer.Isha;
    } else if (date >= this.maghrib) {
      return Prayer.Maghrib;
    } else if (date >= this.asr) {
      return Prayer.Asr;
    } else if (date >= this.dhuhr) {
      return Prayer.Dhuhr;
    } else if (date >= this.sunrise) {
      return Prayer.Sunrise;
    } else if (date >= this.fajr) {
      return Prayer.Fajr;
    } else {
      return Prayer.None;
    }
  }
  nextPrayer(date = new Date()) {
    if (date >= this.isha) {
      return Prayer.None;
    } else if (date >= this.maghrib) {
      return Prayer.Isha;
    } else if (date >= this.asr) {
      return Prayer.Maghrib;
    } else if (date >= this.dhuhr) {
      return Prayer.Asr;
    } else if (date >= this.sunrise) {
      return Prayer.Dhuhr;
    } else if (date >= this.fajr) {
      return Prayer.Sunrise;
    } else {
      return Prayer.Fajr;
    }
  }
}
//# sourceMappingURL=PrayerTimes.js.map
  exports.default = PrayerTimes;
});

__define("packages/core-data/vendor/adhan/Qibla.js", ["packages/core-data/vendor/adhan/Coordinates.js", "packages/core-data/vendor/adhan/MathUtils.js"], function (exports, __deps) {
  const { default: Coordinates } = __deps["packages/core-data/vendor/adhan/Coordinates.js"];
  const { degreesToRadians, radiansToDegrees, unwindAngle } = __deps["packages/core-data/vendor/adhan/MathUtils.js"];
function qibla(coordinates) {
  const makkah = new Coordinates(21.4225241, 39.8261818);

  // Equation from "Spherical Trigonometry For the use of colleges and schools" page 50
  const term1 = Math.sin(degreesToRadians(makkah.longitude) - degreesToRadians(coordinates.longitude));
  const term2 = Math.cos(degreesToRadians(coordinates.latitude)) * Math.tan(degreesToRadians(makkah.latitude));
  const term3 = Math.sin(degreesToRadians(coordinates.latitude)) * Math.cos(degreesToRadians(makkah.longitude) - degreesToRadians(coordinates.longitude));
  const angle = Math.atan2(term1, term2 - term3);
  return unwindAngle(radiansToDegrees(angle));
}
//# sourceMappingURL=Qibla.js.map
  exports.default = qibla;
});

__define("packages/core-data/vendor/adhan/SunnahTimes.js", ["packages/core-data/vendor/adhan/DateUtils.js", "packages/core-data/vendor/adhan/PrayerTimes.js"], function (exports, __deps) {
  const { dateByAddingDays, dateByAddingSeconds, roundedMinute } = __deps["packages/core-data/vendor/adhan/DateUtils.js"];
  const { default: PrayerTimes } = __deps["packages/core-data/vendor/adhan/PrayerTimes.js"];
class SunnahTimes {
  constructor(prayerTimes) {
    const date = prayerTimes.date;
    const nextDay = dateByAddingDays(date, 1);
    const nextDayPrayerTimes = new PrayerTimes(prayerTimes.coordinates, nextDay, prayerTimes.calculationParameters);
    const nightDuration = (nextDayPrayerTimes.fajr.getTime() - prayerTimes.maghrib.getTime()) / 1000.0;
    this.middleOfTheNight = roundedMinute(dateByAddingSeconds(prayerTimes.maghrib, nightDuration / 2));
    this.lastThirdOfTheNight = roundedMinute(dateByAddingSeconds(prayerTimes.maghrib, nightDuration * (2 / 3)));
  }
}
//# sourceMappingURL=SunnahTimes.js.map
  exports.default = SunnahTimes;
});

__define("packages/core-data/vendor/adhan/Adhan.js", ["packages/core-data/vendor/adhan/CalculationMethod.js", "packages/core-data/vendor/adhan/CalculationParameters.js", "packages/core-data/vendor/adhan/Coordinates.js", "packages/core-data/vendor/adhan/HighLatitudeRule.js", "packages/core-data/vendor/adhan/Madhab.js", "packages/core-data/vendor/adhan/PolarCircleResolution.js", "packages/core-data/vendor/adhan/Prayer.js", "packages/core-data/vendor/adhan/PrayerTimes.js", "packages/core-data/vendor/adhan/Qibla.js", "packages/core-data/vendor/adhan/Rounding.js", "packages/core-data/vendor/adhan/Shafaq.js", "packages/core-data/vendor/adhan/SunnahTimes.js"], function (exports, __deps) {
  const { default: CalculationMethod } = __deps["packages/core-data/vendor/adhan/CalculationMethod.js"];
  const { default: CalculationParameters } = __deps["packages/core-data/vendor/adhan/CalculationParameters.js"];
  const { default: Coordinates } = __deps["packages/core-data/vendor/adhan/Coordinates.js"];
  const { default: HighLatitudeRule } = __deps["packages/core-data/vendor/adhan/HighLatitudeRule.js"];
  const { Madhab } = __deps["packages/core-data/vendor/adhan/Madhab.js"];
  const { PolarCircleResolution } = __deps["packages/core-data/vendor/adhan/PolarCircleResolution.js"];
  const { default: Prayer } = __deps["packages/core-data/vendor/adhan/Prayer.js"];
  const { default: PrayerTimes } = __deps["packages/core-data/vendor/adhan/PrayerTimes.js"];
  const { default: Qibla } = __deps["packages/core-data/vendor/adhan/Qibla.js"];
  const { Rounding } = __deps["packages/core-data/vendor/adhan/Rounding.js"];
  const { Shafaq } = __deps["packages/core-data/vendor/adhan/Shafaq.js"];
  const { default: SunnahTimes } = __deps["packages/core-data/vendor/adhan/SunnahTimes.js"];
//# sourceMappingURL=Adhan.js.map
  exports["Prayer"] = Prayer;
  exports["Madhab"] = Madhab;
  exports["HighLatitudeRule"] = HighLatitudeRule;
  exports["Coordinates"] = Coordinates;
  exports["CalculationParameters"] = CalculationParameters;
  exports["CalculationMethod"] = CalculationMethod;
  exports["PrayerTimes"] = PrayerTimes;
  exports["SunnahTimes"] = SunnahTimes;
  exports["Qibla"] = Qibla;
  exports["PolarCircleResolution"] = PolarCircleResolution;
  exports["Rounding"] = Rounding;
  exports["Shafaq"] = Shafaq;
});

__define("packages/core-data/engines/prayer.js", ["packages/core-data/vendor/adhan/Adhan.js"], function (exports, __deps) {
  const { Coordinates, CalculationMethod, CalculationParameters, PrayerTimes, SunnahTimes, Prayer, HighLatitudeRule, Madhab, Qibla: adhanQibla } = __deps["packages/core-data/vendor/adhan/Adhan.js"];
// ============================================================================
// prayer.js — Sadaqa Jaria v2 prayer-time engine (shared core, target-agnostic)
// ---------------------------------------------------------------------------
// Wraps the vendored adhan@4.4.6 build. Every target (web/Electron/iOS/Android)
// consumes THESE constants and THIS math — never per-platform reimplementations.
//
// Timezone contract (the "bit-for-bit" guarantee):
//   Verified against the vendored source: TimeComponents.utcDate builds results
//   with Date.UTC, and SolarTime's transit/hour-angle values are explicitly in
//   *universal time* — so `pt.fajr.getTime()` etc. are TRUE absolute instants.
//   The only device-dependent input is the civil date adhan reads from the
//   passed Date via runtime-local getters. This engine therefore anchors with
//   `new Date(y, mo, d, 12)` — whose local components are y/mo/d on EVERY
//   runtime — so the Julian day fed to adhan is the city's civil date. Output
//   = epoch-milliseconds, identical on every device for the same inputs.
//   (Empirically pinned: London 2026-03-28 maghrib = 2026-03-28T18:27:00Z.)
//
// Elevation decision (parity over micro-precision): adhan-js has no elevation
// parameter (adhan-swift/-kotlin do). To keep all four targets identical we
// never pass elevation anywhere; `cities.elevation` is stored for potential
// native use but the shared engine ignores it. Documented deviation from the
// city rows, deliberate.
// ============================================================================


/** Canonical prayer order (display + API). */
const PRAYER_NAMES = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

// NOTE: no "gulf" here (resolved 2026-11-18) — the vendored adhan 4.4.6 has no
// Gulf factory, so a gulf entry would be undefined and throw at buildParams()
// time. The Settings UI offers exactly the 12 resolvable methods below.
const METHOD_MAP = {
  muslim_world_league: CalculationMethod.MuslimWorldLeague,
  egyptian: CalculationMethod.Egyptian,
  umm_al_qura: CalculationMethod.UmmAlQura,
  karachi: CalculationMethod.Karachi,
  moonsighting: CalculationMethod.MoonsightingCommittee,
  north_america: CalculationMethod.NorthAmerica,
  dubai: CalculationMethod.Dubai,
  kuwait: CalculationMethod.Kuwait,
  qatar: CalculationMethod.Qatar,
  singapore: CalculationMethod.Singapore,
  turkey: CalculationMethod.Turkey,
  tehran: CalculationMethod.Tehran,
};

const MADHAB_MAP = { shafi: Madhab.Shafi, hanafi: Madhab.Hanafi };
const HLR_MAP = {
  middle_of_the_night: HighLatitudeRule.MiddleOfTheNight,
  seventh_of_the_night: HighLatitudeRule.SeventhOfTheNight,
  twilight_angle: HighLatitudeRule.TwilightAngle,
};

const CALC_METHODS = Object.keys(METHOD_MAP);
const MADHABS = Object.keys(MADHAB_MAP);
const HIGH_LATITUDE_RULES = Object.keys(HLR_MAP);

// ---------------------------------------------------------------------------
// Timezone helpers (Intl-based, zero-dep)
// ---------------------------------------------------------------------------

/** Civil date/time parts of an instant in a timezone: {y, mo, d, h, mi, s}. */
function civilParts(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const p = {};
  for (const { type, value } of dtf.formatToParts(instant)) {
    if (type !== 'literal') p[type] = Number(value);
  }
  // month 1-based → 0-based for Date.UTC/Date constructor parity
  return { y: p.year, mo: p.month - 1, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

/**
 * Wall parts of a Date via RUNTIME-LOCAL getters (utility for display of
 * adhan-produced instants when the runtime tz matches the city; kept exported
 * for user-facing wall-clock conversion helpers like wallClockToInstant).
 */
function localPartsOf(dt) {
  return { y: dt.getFullYear(), mo: dt.getMonth(), d: dt.getDate(), h: dt.getHours(), mi: dt.getMinutes(), s: dt.getSeconds() };
}

/**
 * UTC offset (minutes, east positive) of a timezone at a wall-clock moment.
 * Resolved by probing: interpret candidate offsets, format back in the same
 * timezone, and require the round-trip to reproduce the exact wall time.
 * Handles DST gaps/overlaps by preferring the offset whose round-trip matches.
 */
function tzOffsetMinutes(wallParts, timeZone) {
  const { y, mo, d, h, mi, s } = wallParts;
  const naive = Date.UTC(y, mo, d, h, mi, s);
  // DST transitions never jump more than ±2h; probe the plausible range.
  for (const guess of [0, 60, -60, 120, -120, 180, -180, 210, -210, 240, -240, 300, -300, 330, -330, 345, -345, 420, -420, 480, -480, 540, -540, 570, -570, 600, -600, 660, -660, 720, -720, 780, -780, 840, -840]) {
    const instant = naive - guess * 60_000;
    const back = civilParts(instant, timeZone);
    if (back.y === y && back.mo === mo && back.d === d && back.h === h && back.mi === mi && back.s === s) {
      return guess;
    }
  }
  throw new Error(`cannot resolve UTC offset for ${timeZone} at ${y}-${mo + 1}-${d} ${h}:${mi}:${s}`);
}

/** Wall-clock parts (in the city) → true instant (epoch ms). */
function wallClockToInstant(wallParts, timeZone) {
  const off = tzOffsetMinutes(wallParts, timeZone);
  return Date.UTC(wallParts.y, wallParts.mo, wallParts.d, wallParts.h, wallParts.mi, wallParts.s) - off * 60_000;
}

/** Civil-date anchor in the city: local-noon Date whose local components match. */
function localNoonAnchor(y, mo, d) {
  return new Date(y, mo, d, 12, 0, 0, 0);
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

function buildParams({ method = 'umm_al_qura', madhab = 'shafi', highLatitudeRule = 'middle_of_the_night', offsets = {} } = {}) {
  const factory = METHOD_MAP[method];
  if (!factory) throw new Error(`unknown calc method: ${method} (allowed: ${CALC_METHODS.join(', ')})`);
  const params = factory(); // CalculationParameters
  params.madhab = MADHAB_MAP[madhab] ?? null;
  if (params.madhab === null) throw new Error(`unknown madhab: ${madhab} (allowed: ${MADHABS.join(', ')})`);
  if (highLatitudeRule !== undefined && highLatitudeRule !== null) {
    const hlr = HLR_MAP[highLatitudeRule];
    if (!hlr) throw new Error(`unknown highLatitudeRule: ${highLatitudeRule} (allowed: ${HIGH_LATITUDE_RULES.join(', ')})`);
    params.highLatitudeRule = hlr;
  }
  for (const [name, minutes] of Object.entries(offsets ?? {})) {
    if (!PRAYER_NAMES.includes(name)) throw new Error(`unknown prayer for offset: ${name}`);
    if (!Number.isFinite(minutes) || Math.abs(minutes) > 60) throw new Error(`offset for ${name} out of range: ${minutes}`);
    params.adjustments[name] = minutes; // adhan-js PrayerAdjustments
  }
  return params;
}

/**
 * computeForDate({ y, mo, d } civil date in `timeZone`, opts) →
 * { times: {fajr…isha: epochMs}, dayStart, dayEnd } — true instants.
 * opts: { lat, lng, timeZone, method, madhab, highLatitudeRule, offsets }
 */
function computeForDate({ y, mo, d }, { lat, lng, timeZone, ...cfg } = {}) {
  if (!timeZone) throw new Error('timeZone is required (IANA name)');
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error(`invalid lat: ${lat}`);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error(`invalid lng: ${lng}`);
  const coords = new Coordinates(lat, lng);
  const params = buildParams(cfg);
  const pt = new PrayerTimes(coords, localNoonAnchor(y, mo, d), params);
  const times = {};
  for (const name of PRAYER_NAMES) {
    // adhan's output Dates are true UTC instants (see header contract); the
    // local-noon anchor guarantees the civil date was the city's. Floor to
    // whole seconds because adhan-js DateUtils.roundedMinute leaves sub-second
    // 1000/7 ms fractions on seventh_of_the_night whereas Adhan-Swift/Java do not.
    times[name] = Math.floor(pt.timeForPrayer(name).getTime() / 1000) * 1000;
  }
  return { times };
}

/**
 * daySchedule(dateIso, opts) → one day's schedule with the previous day's isha
 * included for countdown continuity. dateIso: "YYYY-MM-DD" interpreted in the
 * city timezone.
 */
function daySchedule(dateIso, opts) {
  const [y, mo, d] = dateIso.split('-').map(Number);
  const { times } = computeForDate({ y, mo: mo - 1, d }, opts);
  const prev = new Date(Date.UTC(y, mo - 1, d - 1));
  const { y: py, mo: pmo, d: pd } = civilParts(prev, 'UTC');
  const { times: prevTimes } = computeForDate({ y: py, mo: pmo, d: pd }, opts);
  return {
    date: dateIso,
    timeZone: opts.timeZone,
    prayers: times,
    previousIsha: prevTimes.isha,
  };
}

/** Civil "YYYY-MM-DD" of an instant in a timezone. */
function civilIso(instant, timeZone) {
  const p = civilParts(instant, timeZone);
  return `${p.y}-${String(p.mo + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** Shift a civil "YYYY-MM-DD" date by deltaDays without DST 86400s drift. */
function shiftCivilIso(dateIso, deltaDays) {
  const [y, mo, d] = dateIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + deltaDays));
  const p = civilParts(dt, 'UTC');
  return `${p.y}-${String(p.mo + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/**
 * next(nowEpochMs, opts) → { name, at, previous: { name, at } }
 * Scans yesterday/today/tomorrow in the city timezone; `now` may belong to the
 * city's next civil day (travel). Deterministic, no recomputation loops.
 */
function next(nowEpochMs, opts) {
  const todayIso = civilIso(nowEpochMs, opts.timeZone);
  const y = daySchedule(shiftCivilIso(todayIso, -1), opts);
  const t = daySchedule(todayIso, opts);
  const n = daySchedule(shiftCivilIso(todayIso, 1), opts);

  const flat = [];
  for (const sched of [y, t, n]) {
    for (const name of PRAYER_NAMES) flat.push({ name, at: sched.prayers[name] });
  }
  const prevIdx = (() => {
    let last = -1;
    for (let i = 0; i < flat.length; i++) if (flat[i].at <= nowEpochMs) last = i;
    return last;
  })();
  const nextIdx = prevIdx + 1;
  if (nextIdx >= flat.length) throw new Error('no next prayer found (unreachable for ±1 day scan)');
  return { name: flat[nextIdx].name, at: flat[nextIdx].at, previous: flat[prevIdx] };
}

/**
 * schedule(year, monthNumber1Based, opts) → monthly table
 * (Ameen evidence: "View the full month's prayer schedule at a glance").
 * Rows: { date, prayers{…} } for every civil day of the month in the city tz.
 */
function schedule(year, month1, opts) {
  if (month1 < 1 || month1 > 12) throw new Error('month must be 1..12');
  const days = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const rows = [];
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const { times } = computeForDate({ y: year, mo: month1 - 1, d }, opts);
    rows.push({ date: iso, prayers: times });
  }
  return { year, month: month1, timeZone: opts.timeZone, rows };
}

/**
 * sunnahWindows(dateIso, opts) → { duha, duhaEnd, midnight, lastThird }
 * (REA_SPEC §4.3 formulas, derived from adhan's own sunrise/maghrib/fajr).
 */
function sunnahWindows(dateIso, opts) {
  const [y, mo, d] = dateIso.split('-').map(Number);
  const coords = new Coordinates(opts.lat, opts.lng);
  const params = buildParams(opts);
  const pt = new PrayerTimes(coords, localNoonAnchor(y, mo - 1, d), params);
  const st = new SunnahTimes(pt); // night math uses next-day fajr internally
  const sunriseI = Math.floor(pt.sunrise.getTime() / 1000) * 1000;
  const maghribI = Math.floor(pt.maghrib.getTime() / 1000) * 1000;
  // next day's fajr as the night's end anchor (same math as SunnahTimes uses)
  const nextDay = new Date(Date.UTC(y, mo - 1, d + 1));
  const { y: ny, mo: nmo, d: nd } = civilParts(nextDay, 'UTC');
  const nextFajrI = computeForDate({ y: ny, mo: nmo, d: nd }, opts).times.fajr;
  const nightLength = nextFajrI - maghribI;
  return {
    duha: sunriseI + Math.round((maghribI - sunriseI) * 0.25),
    duhaEnd: sunriseI + Math.round((maghribI - sunriseI) * 0.5),
    midnight: maghribI + Math.round(nightLength / 2),
    lastThird: maghribI + Math.round((2 * nightLength) / 3),
    // adhan's own rounded outputs (kept for cross-checks):
    adhanMidnight: st.middleOfTheNight.getTime(),
    adhanLastThird: st.lastThirdOfTheNight.getTime(),
    nextFajr: nextFajrI,
  };
}

/** Bound engine object for reminder/anchor consumers (reminders.js ctx.prayerEngine). */
function bindPrayerEngine(opts) {
  return {
    opts,
    daySchedule: (iso) => daySchedule(iso, opts),
    sunnahWindows: (iso) => sunnahWindows(iso, opts),
    next: (now) => next(now, opts),
  };
}

/** Bind a prayer engine from a persisted user_settings map (shared by web + Electron). */
function bindPrayerEngineFromSettings(settings = {}) {
  const loc = settings.location ?? { lat: 21.4225, lng: 39.8262, tz: 'Asia/Riyadh' };
  return bindPrayerEngine({
    lat: Number(loc.lat ?? 21.4225),
    lng: Number(loc.lng ?? 39.8262),
    timeZone: loc.timeZone || loc.tz || 'Asia/Riyadh',
    method: settings.calc_method ?? 'umm_al_qura',
    madhab: settings.madhab ?? 'shafi',
    highLatitudeRule: settings.high_latitude_rule ?? 'middle_of_the_night',
    offsets: settings.prayer_offsets ?? {},
  });
}
  exports["rawQibla"] = adhanQibla;
  exports["RawCoordinates"] = Coordinates;
  exports["RawParameters"] = CalculationParameters;
  exports["PRAYER_NAMES"] = PRAYER_NAMES;
  exports["CALC_METHODS"] = CALC_METHODS;
  exports["MADHABS"] = MADHABS;
  exports["HIGH_LATITUDE_RULES"] = HIGH_LATITUDE_RULES;
  exports["civilParts"] = civilParts;
  exports["localPartsOf"] = localPartsOf;
  exports["wallClockToInstant"] = wallClockToInstant;
  exports["computeForDate"] = computeForDate;
  exports["daySchedule"] = daySchedule;
  exports["civilIso"] = civilIso;
  exports["shiftCivilIso"] = shiftCivilIso;
  exports["next"] = next;
  exports["schedule"] = schedule;
  exports["sunnahWindows"] = sunnahWindows;
  exports["bindPrayerEngine"] = bindPrayerEngine;
  exports["bindPrayerEngineFromSettings"] = bindPrayerEngineFromSettings;
});

__define("packages/core-data/engines/qibla.js", [], function (exports, __deps) {
// ============================================================================
// qibla.js — great-circle Qibla bearing (pure math, zero-dep)
// Kaaba: 21.4225°N, 39.8262°E (standard published coordinates).
// ============================================================================

const KAABA = { lat: 21.4225, lng: 39.8262 };
const rad = (deg) => (deg * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Initial great-circle bearing (degrees, 0=N, clockwise) from {lat,lng} to the Kaaba. */
function qiblaBearing({ lat, lng }) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error(`invalid lat: ${lat}`);
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error(`invalid lng: ${lng}`);
  const φ1 = rad(lat), φ2 = rad(KAABA.lat), Δλ = rad(KAABA.lng - lng);
  const θ = Math.atan2(
    Math.sin(Δλ) * Math.cos(φ2),
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ),
  );
  return (deg(θ) + 360) % 360;
}

/** Great-circle distance in km (haversine) — used to pick the dial fallback threshold. */
function distanceKm({ lat, lng }) {
  const R = 6371.0088;
  const φ1 = rad(lat), φ2 = rad(KAABA.lat);
  const Δφ = rad(KAABA.lat - lat), Δλ = rad(KAABA.lng - lng);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const KAABA_COORDS = KAABA;
  exports["qiblaBearing"] = qiblaBearing;
  exports["distanceKm"] = distanceKm;
  exports["KAABA_COORDS"] = KAABA_COORDS;
});

  var __global = typeof window !== 'undefined' ? window : globalThis;
  __global.CoreData = Object.freeze({
    prayer: Object.freeze(__registry["packages/core-data/engines/prayer.js"]),
    qibla: Object.freeze(__registry["packages/core-data/engines/qibla.js"]),
  });
})();
