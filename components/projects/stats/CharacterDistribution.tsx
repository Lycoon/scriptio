"use client";

import "chart.js/auto";
import type { ChartOptions, ChartDataset } from "chart.js";
import { Line } from "react-chartjs-2";
import { Distribution, Frequency, getRandomColors, getScaledDistribution } from "@src/lib/screenplay/statistics";

type Props = {
    color: string;
    distribution: Distribution;
    frequency: Frequency;
};

const CharacterDistribution = ({ distribution }: Props) => {
    const scaled = getScaledDistribution(distribution);
    const labels: number[] = [];
    const datasets: ChartDataset<'line', number[]>[] = [];

    for (const actor in scaled) {
        // optimization to get all labels?
        const distr = scaled[actor];
        for (const snapped in distr) {
            if (!labels.includes(+snapped)) labels.push(+snapped);
        }
    }
    labels.sort((a, b) => a - b);

    for (const actor in scaled) {
        const distr = scaled[actor];
        const quantities: number[] = [];

        for (const label of labels) {
            quantities.push(distr[label]);
        }

        datasets.push({
            label: actor,
            data: quantities,
            fill: false,
            borderColor: getRandomColors(labels.length, 0.9, 0.75),
            tension: 0.4,
        });
    }

    const data = {
        labels,
        datasets,
    };

    const options = {
        aspectRatio: 2,
        layout: {
            padding: 50,
        },
        plugins: {
            legend: {
                events: [],
                display: true,
                position: "top",
                labels: {
                    padding: 20,
                },
            },
        },
    };

    return <Line data={data} options={options as ChartOptions<'line'>} />;
};

export default CharacterDistribution;
