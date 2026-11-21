// ============================================================================
// LiquidGlass.kt — Authentic Liquid Glass surfaces for the control layer ONLY
// (floating navigation pill, Mushaf floating HUD toolbars, floating pills).
// Strictly obeys tokens.json glassPolicy: NEVER applied to content cards
// (CardBox, Mushaf page plates, Athkar cards, Tool cards, sheets).
//
// Layered optics:
//  1. Soft ambient elevation shadow (graceful on older Android APIs).
//  2. Translucent layered glass tint + internal top-edge refraction sheen.
//  3. Optional GPU-blurred ambient frost layer on Android 12+ (API 31+) placed
//     strictly behind foreground content so icons/text stay razor-sharp; on
//     API 26–30 falls back to a slightly higher-opacity layered glass fill.
//  4. Directional specular highlight border via Brush.linearGradient.
// ============================================================================

package app.sadaqa.android.ui

import android.os.Build
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Theme-calibrated Liquid Glass color palette for floating controls. */
@Immutable
data class SadaqaGlassPalette(
    val fillTop: Color,
    val fillBottom: Color,
    val frostGlow: Color,
    val sheenTop: Color,
    val specularTop: Color,
    val rimMid: Color,
    val rimShadow: Color,
    val specularBottom: Color,
    val shadowColor: Color,
    val activeFillTop: Color,
    val activeFillBottom: Color,
    val activeBorderTop: Color,
    val activeBorderBottom: Color,
    val activeContent: Color,
)

/** Derives a calibrated Liquid Glass palette from the active [SadaqaColors] theme. */
fun glassPaletteFor(colors: SadaqaColors): SadaqaGlassPalette {
    val bgLum = colors.bg.luminance()
    val supportsBlur = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    val alphaBoost = if (supportsBlur) 0f else 0.08f

    return when {
        // OLED / Night — pure black (#000000) obsidian glass
        bgLum < 0.001f -> SadaqaGlassPalette(
            fillTop = Color(0xFF151919).copy(alpha = (0.80f + alphaBoost).coerceAtMost(0.94f)),
            fillBottom = Color(0xFF0A0D0D).copy(alpha = (0.86f + alphaBoost).coerceAtMost(0.96f)),
            frostGlow = colors.accent.copy(alpha = 0.08f),
            sheenTop = Color.White.copy(alpha = 0.14f),
            specularTop = Color.White.copy(alpha = 0.30f),
            rimMid = Color.White.copy(alpha = 0.11f),
            rimShadow = Color.White.copy(alpha = 0.04f),
            specularBottom = Color.White.copy(alpha = 0.16f),
            shadowColor = Color.Black.copy(alpha = 0.65f),
            activeFillTop = Color(0xFF2DD4BF).copy(alpha = 0.24f),
            activeFillBottom = Color(0xFF2DD4BF).copy(alpha = 0.12f),
            activeBorderTop = Color(0xFF5EEAD4).copy(alpha = 0.56f),
            activeBorderBottom = Color(0xFF2DD4BF).copy(alpha = 0.22f),
            activeContent = Color(0xFF5EEAD4),
        )
        // Dark — emerald obsidian glass (matches shell.css dark tokens)
        bgLum < 0.40f -> SadaqaGlassPalette(
            fillTop = Color(0xFF142A25).copy(alpha = (0.78f + alphaBoost).coerceAtMost(0.92f)),
            fillBottom = Color(0xFF0A1715).copy(alpha = (0.84f + alphaBoost).coerceAtMost(0.95f)),
            frostGlow = Color(0xFF2DD4BF).copy(alpha = 0.10f),
            sheenTop = Color.White.copy(alpha = 0.15f),
            specularTop = Color.White.copy(alpha = 0.32f),
            rimMid = Color.White.copy(alpha = 0.12f),
            rimShadow = Color.White.copy(alpha = 0.05f),
            specularBottom = Color(0xFF5EEAD4).copy(alpha = 0.16f),
            shadowColor = Color.Black.copy(alpha = 0.52f),
            activeFillTop = Color(0xFF2DD4BF).copy(alpha = 0.24f),
            activeFillBottom = Color(0xFF2DD4BF).copy(alpha = 0.13f),
            activeBorderTop = Color(0xFF5EEAD4).copy(alpha = 0.58f),
            activeBorderBottom = Color(0xFF2DD4BF).copy(alpha = 0.24f),
            activeContent = Color(0xFF5EEAD4),
        )
        // Sepia — warm frosted parchment glass (matches shell.css sepia tokens)
        colors.bg.blue < 0.86f -> SadaqaGlassPalette(
            fillTop = Color(0xFFFCF6E8).copy(alpha = (0.84f + alphaBoost).coerceAtMost(0.95f)),
            fillBottom = Color(0xFFF1E3C6).copy(alpha = (0.88f + alphaBoost).coerceAtMost(0.96f)),
            frostGlow = colors.accent.copy(alpha = 0.10f),
            sheenTop = Color(0xFFFFFDF7).copy(alpha = 0.72f),
            specularTop = Color(0xFFFFFDF8).copy(alpha = 0.90f),
            rimMid = Color(0xFF3E2E1D).copy(alpha = 0.15f),
            rimShadow = Color(0xFF3E2E1D).copy(alpha = 0.08f),
            specularBottom = Color(0xFFFFFAF0).copy(alpha = 0.55f),
            shadowColor = Color(0xFF3E2E1D).copy(alpha = 0.24f),
            activeFillTop = Color(0xFF7A5C10).copy(alpha = 0.20f),
            activeFillBottom = Color(0xFF7A5C10).copy(alpha = 0.11f),
            activeBorderTop = Color(0xFF7A5C10).copy(alpha = 0.44f),
            activeBorderBottom = Color(0xFF7A5C10).copy(alpha = 0.18f),
            activeContent = Color(0xFF7A5C10),
        )
        // Light — frosted ivory glass (matches shell.css light tokens)
        else -> SadaqaGlassPalette(
            fillTop = Color(0xFFFEFCF8).copy(alpha = (0.82f + alphaBoost).coerceAtMost(0.94f)),
            fillBottom = Color(0xFFF1ECE1).copy(alpha = (0.87f + alphaBoost).coerceAtMost(0.96f)),
            frostGlow = Color(0xFF0F766E).copy(alpha = 0.08f),
            sheenTop = Color.White.copy(alpha = 0.80f),
            specularTop = Color.White.copy(alpha = 0.94f),
            rimMid = Color(0xFF1C2833).copy(alpha = 0.13f),
            rimShadow = Color(0xFF1C2833).copy(alpha = 0.07f),
            specularBottom = Color.White.copy(alpha = 0.65f),
            shadowColor = Color(0xFF1C2833).copy(alpha = 0.20f),
            activeFillTop = Color(0xFF0F766E).copy(alpha = 0.19f),
            activeFillBottom = Color(0xFF0F766E).copy(alpha = 0.10f),
            activeBorderTop = Color(0xFF0F766E).copy(alpha = 0.42f),
            activeBorderBottom = Color(0xFF0F766E).copy(alpha = 0.18f),
            activeContent = Color(0xFF0F766E),
        )
    }
}

@Composable
fun rememberGlassPalette(colors: SadaqaColors = LocalSadaqaTheme.current): SadaqaGlassPalette =
    remember(colors) { glassPaletteFor(colors) }

/**
 * Floating Liquid Glass container for primary floating controls (bottom nav capsule,
 * Mushaf floating HUD toolbars). Renders a layered translucent fill, GPU-blurred
 * internal refraction frost layer on Android 12+ (graceful solid-translucent fallback
 * on API 26–30), subtle top specular sheen, and directional specular gradient border.
 *
 * Foreground [content] is never blurred.
 */
@Composable
fun LiquidGlassSurface(
    shape: Shape,
    modifier: Modifier = Modifier,
    elevation: Dp = 14.dp,
    borderWidth: Dp = 1.dp,
    glass: SadaqaGlassPalette = rememberGlassPalette(),
    content: @Composable BoxScope.() -> Unit,
) {
    val fillBrush = remember(glass) {
        Brush.verticalGradient(listOf(glass.fillTop, glass.fillBottom))
    }
    val borderBrush = remember(glass) {
        Brush.linearGradient(
            0.0f to glass.specularTop,
            0.35f to glass.rimMid,
            0.72f to glass.rimShadow,
            1.0f to glass.specularBottom,
            start = Offset.Zero,
            end = Offset.Infinite,
        )
    }

    Box(
        modifier = modifier
            .shadow(
                elevation = elevation,
                shape = shape,
                ambientColor = glass.shadowColor,
                spotColor = glass.shadowColor,
                clip = false,
            )
            .clip(shape)
            .background(fillBrush, shape)
            .drawWithCache {
                // Crisp top-edge optical refraction highlight inside the glass rim
                val sheenBrush = Brush.verticalGradient(
                    0.0f to glass.sheenTop,
                    0.42f to Color.Transparent,
                    startY = 0f,
                    endY = size.height * 0.55f,
                )
                onDrawBehind {
                    drawRect(brush = sheenBrush)
                }
            }
            .border(borderWidth, borderBrush, shape),
    ) {
        // Ambient blurred frost layer strictly behind foreground children (API 31+);
        // older APIs automatically receive the boosted translucent fill above.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val frostBrush = remember(glass) {
                Brush.linearGradient(
                    colors = listOf(glass.sheenTop.copy(alpha = glass.sheenTop.alpha * 0.65f), glass.frostGlow, Color.Transparent),
                    start = Offset.Zero,
                    end = Offset.Infinite,
                )
            }
            Box(
                Modifier
                    .matchParentSize()
                    .blur(18.dp, edgeTreatment = BlurredEdgeTreatment.Unbounded)
                    .background(frostBrush),
            )
        }
        content()
    }
}

/**
 * Lightweight Liquid Glass modifier for compact floating control pills
 * (Today header pills, Mushaf page pill, slider preview badge, active nav lens).
 */
@Composable
fun Modifier.liquidGlassPill(
    shape: Shape,
    elevation: Dp = 6.dp,
    borderWidth: Dp = 1.dp,
    glass: SadaqaGlassPalette = rememberGlassPalette(),
): Modifier {
    val fillBrush = remember(glass) {
        Brush.verticalGradient(listOf(glass.fillTop, glass.fillBottom))
    }
    val borderBrush = remember(glass) {
        Brush.linearGradient(
            0.0f to glass.specularTop,
            0.40f to glass.rimMid,
            1.0f to glass.specularBottom,
            start = Offset.Zero,
            end = Offset.Infinite,
        )
    }
    return this
        .shadow(
            elevation = elevation,
            shape = shape,
            ambientColor = glass.shadowColor,
            spotColor = glass.shadowColor,
            clip = false,
        )
        .clip(shape)
        .background(fillBrush, shape)
        .drawWithCache {
            val sheen = Brush.verticalGradient(
                0.0f to glass.sheenTop,
                0.5f to Color.Transparent,
                startY = 0f,
                endY = size.height * 0.6f,
            )
            onDrawBehind { drawRect(brush = sheen) }
        }
        .border(borderWidth, borderBrush, shape)
}
