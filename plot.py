#!/usr/bin/env python3
"""
CSV Data Plotter
Usage: python plot.py <csv_file> [--x X_COLUMN] [--y Y_COLUMN,Y_COLUMN2,...] [--type LINE|BAR|SCATTER]
"""

import sys
import argparse
import pandas as pd
import matplotlib.pyplot as plt

def plot_csv(csv_file, x_col=None, y_cols=None, plot_type='line', title=None, xlabel=None, ylabel=None):
    """Plot data from a CSV file."""
    # Read CSV file
    df = pd.read_csv(csv_file)
    
    # Auto-detect columns if not specified
    if y_cols is None:
        y_cols = [df.columns[0]]
    elif isinstance(y_cols, str):
        y_cols = [c.strip() for c in y_cols.split(',')]
    
    # Set default title
    if title is None:
        if x_col is None:
            title = f'{", ".join(y_cols)} by sequence'
        else:
            title = f'{", ".join(y_cols)} vs {x_col}'
    if xlabel is None:
        xlabel = 'sequence' if x_col is None else x_col
    if ylabel is None:
        ylabel = ', '.join(y_cols)
    
    # Create plot
    fig, ax = plt.subplots(figsize=(10, 6))
    
    # Use sequence (index) for x-axis if x_col is None
    if x_col is None:
        x_data = range(len(df))
    else:
        x_data = df[x_col]
    
    # Plot each y column
    colors = plt.rcParams['axes.prop_cycle'].by_key()['color']
    for i, y_col in enumerate(y_cols):
        if plot_type == 'line':
            ax.plot(x_data, df[y_col], marker='o', linewidth=2, markersize=4, label=y_col, color=colors[i % len(colors)])
        elif plot_type == 'bar':
            ax.bar([x + i * 0.2 for x in range(len(df))], df[y_col], width=0.2, label=y_col, color=colors[i % len(colors)])
        elif plot_type == 'scatter':
            ax.scatter(x_data, df[y_col], s=50, label=y_col, color=colors[i % len(colors)])
        else:
            print(f"Unknown plot type: {plot_type}")
            return
    
    ax.set_xlabel(xlabel, fontsize=12)
    ax.set_ylabel(ylabel, fontsize=12)
    ax.set_title(title, fontsize=14)
    ax.grid(True, alpha=0.3)
    if len(y_cols) > 1:
        ax.legend()
    
    plt.tight_layout()
    plt.show()

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Plot CSV data')
    parser.add_argument('csv_file', help='Path to CSV file')
    parser.add_argument('--x', help='X column name', default=None)
    parser.add_argument('--y', help='Y column name(s), comma-separated for multiple', default='filtered')
    parser.add_argument('--type', choices=['line', 'bar', 'scatter'], default='line', help='Plot type')
    parser.add_argument('--title', help='Plot title', default=None)
    parser.add_argument('--xlabel', help='X axis label', default='timestamp')
    parser.add_argument('--ylabel', help='Y axis label', default=None)
    
    args = parser.parse_args()
    plot_csv(args.csv_file, args.x, args.y, args.type, args.title, args.xlabel, args.ylabel)
