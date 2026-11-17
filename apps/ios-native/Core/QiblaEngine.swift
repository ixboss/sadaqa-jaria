// ============================================================================
// QiblaEngine.swift — port of packages/core-data/engines/qibla.js (golden)
// Great-circle bearing + haversine distance. Kaaba: 21.4225°N, 39.8262°E.
// ============================================================================

import Foundation

public enum QiblaEngine {
    public static let kaabaLat = 21.4225
    public static let kaabaLng = 39.8262

    /// Initial great-circle bearing (degrees, 0=N, clockwise) to the Kaaba.
    public static func qiblaBearing(lat: Double, lng: Double) -> Double {
        let φ1 = lat * .pi / 180, φ2 = kaabaLat * .pi / 180
        let Δλ = (kaabaLng - lng) * .pi / 180
        let θ = atan2(sin(Δλ) * cos(φ2), cos(φ1) * sin(φ2) - sin(φ1) * cos(φ2) * cos(Δλ))
        return (θ * 180 / .pi + 360).truncatingRemainder(dividingBy: 360)
    }

    /// Great-circle distance in km (haversine).
    public static func distanceKm(lat: Double, lng: Double) -> Double {
        let r = 6371.0088
        let φ1 = lat * .pi / 180, φ2 = kaabaLat * .pi / 180
        let Δφ = (kaabaLat - lat) * .pi / 180, Δλ = (kaabaLng - lng) * .pi / 180
        let a = pow(sin(Δφ / 2), 2) + cos(φ1) * cos(φ2) * pow(sin(Δλ / 2), 2)
        return 2 * r * asin(sqrt(a))
    }
}
