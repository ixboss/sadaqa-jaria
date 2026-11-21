// ============================================================================
// ClockFormat — display-only wall-clock formatting shared by the app and the
// widget extension (the PrayerWidgets target compiles this file directly).
// The parity engines keep epoch-ms values and the web "HH:mm" shapes; every
// user-facing prayer/Qiyam clock renders 12-hour "h:mm AM/PM" with standard
// Western digits (e.g. 2:34 PM, 12:57 AM) per the 2026-11 display contract.
// Pure integer math — locale-independent digits, no DateFormatter per tick.
// ============================================================================

import Foundation

public enum ClockFormat {
    /// 12-hour "h:mm AM/PM" wall clock in the city timezone.
    /// Hour 0 → "12:xx AM" (midnight hour), hour 12 → "12:xx PM" (noon hour).
    public static func twelveHour(_ ms: Int64, tz: String) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: tz) ?? .current
        let c = cal.dateComponents([.hour, .minute], from: Date(ms: ms))
        let h24 = c.hour ?? 0
        let minute = c.minute ?? 0
        let h12 = (h24 + 11) % 12 + 1
        return "\(h12):\(String(format: "%02d", minute)) \(h24 < 12 ? "AM" : "PM")"
    }
}
