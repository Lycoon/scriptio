import { Project } from "../../../pages/api/users";

import "chart.js/auto";
import { Bubble, Doughnut, Line } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import {
    Distribution,
    Frequency,
    getRandomColors,
    getScaledDistribution,
} from "../../../src/lib/statistics";
import { useEffect, useState } from "react";

type Props = {
    project: Project;
    color: string;
    distribution: Distribution;
    frequency: Frequency;
};

const CharacterDistribution = ({ project, color, distribution }: Props) => {
    let scaled = getScaledDistribution(distribution);
    const labels: any[] = [];
    const datasets: any[] = [];

    for (const actor in scaled) {
        // optimization to get all labels?
        const distr = scaled[actor];
        for (const snapped in distr) {
            if (!labels.includes(+snapped)) labels.push(+snapped);
        }
    }
    labels.sort((a, b) => a - b);

    for (const actor in scaled) {
        const distr: any = scaled[actor];
        const quantities: any[] = [];

        for (const label of labels) {
            quantities.push(distr[label]);
        }

        datasets.push({
            label: actor,
            data: quantities,
            fill: false,
            borderColor:
                "rgb(" +
                Math.random() * 255 +
                ", " +
                Math.random() * 255 +
                ", " +
                Math.random() * 255 +
                ")",
            tension: 0.4,
        });
    }

    const data = {
        labels,
        datasets,
    };

    const options = {
        aspectRatio: 1.4,
        layout: {
            padding: 40,
        },
        plugins: {
            legend: {
                events: [],
                display: true,
                position: "bottom",
            },
        },
    };

    return <Line data={data} options={options as any} />;
};

export default CharacterDistribution;
