import pandas as pd
import matplotlib.pyplot as plt

# --- Load data ---
df = pd.read_csv("data.csv")

# --- Parse time ---
df["timestamp"] = pd.to_datetime(df["timestamp"], format="%I:%M:%S %p")
df["t_sec"] = (df["timestamp"] - df["timestamp"].iloc[0]).dt.total_seconds()

# --- Clean note ---
df["note"] = pd.to_numeric(df["note"], errors="coerce").round().astype("Int64")

# --- Figure ---
fig, ax1 = plt.subplots(figsize=(14, 6))

# --- Primary axis (currents) ---
signals = {
    "current_raw": "#378ADD",
    "current_whitaker": "#1D9E75",
    "current_filtered": "#D85A30",
}

for signal, color in signals.items():
    ax1.plot(df["t_sec"], df[signal], color=color, linewidth=1.5, label=signal)

ax1.set_xlabel("Time (seconds)")
ax1.set_ylabel("Current (A)")
ax1.grid(axis="y", color="lightgray", linewidth=0.5)

# --- Secondary axis (temperature & humidity) ---
ax2 = ax1.twinx()

ax2.plot(df["t_sec"], df["temperature"],
         color="red", linestyle="--", linewidth=1.5, label="temperature")

ax2.plot(df["t_sec"], df["humidity"],
         color="purple", linestyle=":", linewidth=1.5, label="humidity")

ax2.set_ylabel("Temp / Humidity")

# --- Highlight note regions (same as before) ---
transitions = df["note"].ne(df["note"].shift())

colors = ["#f0f0f0", "#d0e7ff", "#e8f5e9", "#fff3e0"]

start = df["t_sec"].iloc[0]
current_note = df["note"].iloc[0]
color_idx = 0

for i in range(1, len(df)):
    if transitions.iloc[i]:
        end = df["t_sec"].iloc[i]

        ax1.axvspan(start, end, color=colors[color_idx % len(colors)], alpha=0.3)
        ax1.axvline(end, color="gray", linestyle=":", linewidth=1)

        # label
        x_mid = (start + end) / 2
        ax1.text(x_mid, ax1.get_ylim()[1]*0.98,
                 f"{current_note}",
                 ha="center", va="top", fontsize=8)

        start = end
        current_note = df["note"].iloc[i]
        color_idx += 1

# last region
end = df["t_sec"].iloc[-1]

ax1.axvspan(start, end, color=colors[color_idx % len(colors)], alpha=0.3)

# add label (this was missing or inconsistent before)
x_mid = (start + end) / 2
ax1.text(
    x_mid,
    ax1.get_ylim()[1] * 0.98,
    f"{current_note}",
    ha="center",
    va="top",
    fontsize=8
)

# --- Combine legends from both axes ---
lines_1, labels_1 = ax1.get_legend_handles_labels()
lines_2, labels_2 = ax2.get_legend_handles_labels()

ax1.legend(lines_1 + lines_2, labels_1 + labels_2, loc="upper right")

# --- Final ---
plt.tight_layout()
plt.savefig("sensor_plot.png", dpi=150)
plt.show()

print("Plot saved to sensor_plot.png")