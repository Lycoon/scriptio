import { Project } from "../../../pages/api/users";

import "chart.js/auto";
import { Doughnut } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import {
    getCharacterFrequency,
    getRandomColors,
} from "../../../src/lib/statistics";
import { useEffect, useState } from "react";

type Props = {
    project: Project;
    color: string;
};

const CharacterFrequency = ({ project, color }: Props) => {
    const frequency = getCharacterFrequency(project.screenplay);
    const labels = Object.keys(frequency);

    const data = {
        labels: labels,
        datasets: [
            {
                backgroundColor: getRandomColors(labels.length, 0.9, 0.75),
                borderColor: color,
                data: Object.values(frequency)
            },
        ],
    };

    const options = {
        aspectRatio: 1.4,
        layout: {
            padding: 30,
        },
        plugins: {
            legend: {
                events: [],
                display: true,
                position: "left",
            },
        },
    };

    return (
        <Doughnut
            data={data}
            options={options as any}
        />
    );
};

export default CharacterFrequency;
