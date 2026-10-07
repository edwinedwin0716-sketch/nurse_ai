package com.detox.launcher.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** 흑백 위주의 차분한 테마. 화려한 색은 일부러 쓰지 않는다. */
object DetoxTheme {
    val bg = Color(0xFF000000)
    val surface = Color(0xFF141414)
    val fg = Color(0xFFEDEDED)
    val dim = Color(0xFF8A8A8A)
    val faint = Color(0xFF3A3A3A)
    val warn = Color(0xFFD9A441)

    @Composable
    operator fun invoke(content: @Composable () -> Unit) {
        MaterialTheme(
            colorScheme = darkColorScheme(
                primary = fg,
                onPrimary = bg,
                background = bg,
                onBackground = fg,
                surface = surface,
                onSurface = fg,
                surfaceContainerHigh = surface,
                secondary = dim,
            ),
            content = content,
        )
    }
}

/** 선택 칩 (작은 테두리 버튼) */
@Composable
fun Chip(text: String, selected: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(50)
    Text(
        text = text,
        color = if (selected) DetoxTheme.bg else DetoxTheme.fg,
        fontSize = 14.sp,
        modifier = Modifier
            .padding(end = 8.dp, bottom = 8.dp)
            .clip(shape)
            .border(1.dp, if (selected) DetoxTheme.fg else DetoxTheme.faint, shape)
            .then(
                if (selected) Modifier.background(DetoxTheme.fg, shape) else Modifier
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
    )
}
