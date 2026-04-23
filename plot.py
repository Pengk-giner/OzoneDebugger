import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches

# --- Load data ---
df = pd.read_csv("ozone_data_2026-04-23T12-33-25-905Z.csv")

# --- Parse timestamp ---
df["timestamp"] = pd.to_datetime(df["timestamp"], format="%I:%M:%S %p")

# Use elapsed time (better for plotting)
df["t_sec"] = (df["timestamp"] - df["timestamp"].iloc[0]).dt.total_seconds()

# --- Clean note column ---
df["note"] = pd.to_numeric(df["note"], errors="coerce").round().astype("Int64")

# --- Signals ---
signals = {
    "current_raw":      "#378ADD",
    "current_whitaker": "#1D9E75",
    "current_filtered": "#D85A30",
}

fig, ax = plt.subplots(figsize=(14, 6))

# --- Plot all signals normally (no note styling) ---
for signal, color in signals.items():
    ax.plot(
        df["t_sec"],
        df[signal],
        color=color,
        linewidth=1.5,
        label=signal
    )

# --- Detect transitions (交叉点) ---
transitions = df["note"].ne(df["note"].shift())

# --- Highlight regions ---
current_note = df["note"].iloc[0]
start = df["t_sec"].iloc[0]

colors = ["#f0f0f0", "#d0e7ff", "#e8f5e9", "#fff3e0"]  # rotate colors

color_idx = 0
y_top = ax.get_ylim()[1]  # top of plot (for placing text)

for i in range(1, len(df)):
    if transitions.iloc[i]:
        end = df["t_sec"].iloc[i]

        # Shade region
        ax.axvspan(start, end, color=colors[color_idx % len(colors)], alpha=0.3)

        # Vertical transition line
        ax.axvline(end, color="gray", linestyle=":", linewidth=1)

        # --- Add label (center of region) ---
        x_mid = (start + end) / 2
        ax.text(
            x_mid,
            y_top * 0.98,   # slightly below top
            f"{current_note}",
            ha="center",
            va="top",
            fontsize=9,
            color="black",
            alpha=0.8
        )

        # Move to next segment
        start = end
        current_note = df["note"].iloc[i]
        color_idx += 1

# --- Last region ---
end = df["t_sec"].iloc[-1]

ax.axvspan(start, end, color=colors[color_idx % len(colors)], alpha=0.3)

x_mid = (start + end) / 2
ax.text(
    x_mid,
    y_top * 0.98,
    f"{current_note}",
    ha="center",
    va="top",
    fontsize=9,
    color="black",
    alpha=0.8
)
# --- Labels ---
ax.set_xlabel("Time (seconds)")
ax.set_ylabel("Current (A)")
ax.set_title("Sensor signals with note regions", fontsize=13)

ax.grid(axis="y", color="lightgray", linewidth=0.5)
ax.spines[["top", "right"]].set_visible(False)

# --- Legend (signals only, clean) ---
ax.legend(loc="upper right")

plt.tight_layout()
plt.savefig("sensor_plot.png", dpi=150)
plt.show()

print("Plot saved to sensor_plot.png")