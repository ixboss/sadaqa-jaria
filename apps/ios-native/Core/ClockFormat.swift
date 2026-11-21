// ============================================================================
// ClockFormat.swift — 12-hour wall-clock formatter ("h:mm AM/PM") with Western
// ASCII digits (0-9) using en_US_POSIX. Compiled into both the SadaqaJaria app
// target and PrayerWidgets extension so every displayed prayer/Qiyam time
// matches identically across the app and widgets.
// ============================================================================

import Foundation

public enum ClockFormat {
    public static let posixLocale = Locale(identifier: "en_US_POSIX")

    /// Converts 24-hour clock components to 12-hour "h:mm AM/PM" using Western
    /// ASCII digits (0-9), e.g. (14, 34) -> "2:34 PM", (0, 57) -> "12:57 AM".
    public static func to12h(hour24: Int, minute: Int) -> String {
        let normalizedHour = ((hour24 % 24) + 24) % 24
        let clampedMinute = min(max(minute, 0), 59)
        let isPM = normalizedHour >= 12
        let hour12 = normalizedHour % 12 == 0 ? 12 : normalizedHour % 12
        return String(
            format: "%d:%02d %@",
            locale: posixLocale,
            hour12,
            clampedMinute,
            isPM ? "PM" : "AM"
        )
    }

    /// Formats an epoch-ms timestamp in the given IANA timezone as 12-hour
    /// "h:mm AM/PM" with Western ASCII digits (0-9).
    public static func formatWallClock12h(_ ms: Int64, timeZone: String) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = posixLocale
        cal.timeZone = TimeZone(identifier: timeZone) ?? .current
        let date = Date(timeIntervalSince1970: TimeInterval(ms) / 1000.0)
        let comps = cal.dateComponents([.hour, .minute], from: date)
        return to12h(hour24: comps.hour ?? 0, minute: comps.minute ?? 0)
    }
}
