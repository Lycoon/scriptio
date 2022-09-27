import { Project } from "../../../pages/api/users";

import "chart.js/auto";
import { Bar, Doughnut } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import {
    Frequency,
    getRandomColors,
    StatsRatio,
} from "../../../src/lib/statistics";
import { useEffect, useState } from "react";

type Props = {
    project: Project;
    color: string;
    ratio: StatsRatio;
};

const BarRatio = ({ project, color, ratio }: Props) => {
    const labels = Object.keys(ratio);

    const data = {
        labels: labels,
        datasets: [
            {
                backgroundColor: getRandomColors(labels.length, 0.9, 0.75),
                borderColor: color,
                data: Object.values(ratio),
            },
        ],
    };

    const options = {
        aspectRatio: 2.5,
        indexAxis: "y",
        barThickness: 40,
        layout: {
            padding: { right: 50, top: 60 },
        },
        plugins: {
            legend: {
                display: false,
            },
        },
    };

    return <Bar data={data} options={options as any} />;
};

export default BarRatio;
