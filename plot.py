import pandas as pd
import matplotlib.pyplot as plt
import os
import glob

# --- Folder containing CSV files ---
folder_path = "./data"   # <-- change this to your folder

csv_files = glob.glob(os.path.join(folder_path, "*.csv"))

print(f"Found {len(csv_files)} CSV files")
    
for file in csv_files:
    print(f"Processing: {file}")

    df = pd.read_csv(file)

    # --- Parse time ---
    df["timestamp"] = pd.to_datetime(df["timestamp"], format="%I:%M:%S %p")
    df["t_sec"] = (df["timestamp"] - df["timestamp"].iloc[0]).dt.total_seconds()

    # --- Clean note ---
    df["note"] = pd.to_numeric(df["note"], errors="coerce").round().astype("Int64")

    # --- Create plot ---
    fig, ax1 = plt.subplots(figsize=(14, 6))

    # --- Plot current signals ---
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

    # --- Secondary axis (temp + humidity) ---
    ax2 = ax1.twinx()

    ax2.plot(df["t_sec"], df["temperature"],
             color="red", linestyle="--", linewidth=1.2, label="temperature")

    ax2.plot(df["t_sec"], df["humidity"],
             color="purple", linestyle=":", linewidth=1.2, label="humidity")

    ax2.set_ylabel("Temp / Humidity")

    # --- Build note segments (robust, no missing last segment) ---
    segments = []
    start_idx = 0

    for i in range(1, len(df)):
        if df["note"].iloc[i] != df["note"].iloc[i - 1]:
            segments.append((start_idx, i - 1))
            start_idx = i

    segments.append((start_idx, len(df) - 1))  # include last

    # --- Highlight regions ---
    colors = ["#f0f0f0", "#d0e7ff", "#e8f5e9", "#fff3e0"]

    for j, (s, e) in enumerate(segments):
        start = df["t_sec"].iloc[s]
        end   = df["t_sec"].iloc[e]
        note_val = df["note"].iloc[s]

        ax1.axvspan(start, end, color=colors[j % len(colors)], alpha=0.3)
        ax1.axvline(end, color="gray", linestyle=":", linewidth=1)

        # label
        x_mid = (start + end) / 2
        ax1.text(
            x_mid,
            ax1.get_ylim()[1] * 0.98,
            f"note={note_val}",
            ha="center",
            va="top",
            fontsize=8
        )

    # --- Legend ---
    lines1, labels1 = ax1.get_legend_handles_labels()
    lines2, labels2 = ax2.get_legend_handles_labels()
    # ax1.legend(lines1 + lines2, labels1 + labels2, loc="upper right")
    ax1.legend(
        lines1 + lines2,
        labels1 + labels2,
        loc="upper center",
        bbox_to_anchor=(0.5, -0.15),
        ncol=3
    )

    # --- Save plot ---
    filename = os.path.splitext(os.path.basename(file))[0]
    output_path = os.path.join(folder_path, f"{filename}_plot.png")

    plt.tight_layout()
    plt.savefig(output_path, dpi=150)

    print(f"Saved: {output_path}")

plt.show()
print("Done.")