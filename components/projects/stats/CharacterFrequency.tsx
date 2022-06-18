import { Project } from "../../../pages/api/users";

import "chart.js/auto";
import { Doughnut } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import {
    getCharacterFrequency,
    getRandomColors,
} from "../../../src/lib/statistics";

type Props = {
    project: Project;
};

const CharacterFrequency = ({ project }: Props) => {
    const frequency = getCharacterFrequency(project.screenplay);
    const labels = Array.from(frequency.keys());
    const data = {
        labels: labels,
        datasets: [
            {
                backgroundColor: getRandomColors(labels.length, 0.9, 0.75),
                data: Array.from(frequency.values()),
                offset: 12,
                hoverOffset: 30,
                hoverBorderColor: "#ffffff",
            },
        ],
    };

    const options = {
        aspectRatio: 1.4,
        layout: {
            padding: 20,
        },
        plugins: {
            tooltip: {
                enabled: false,
            },
            datalabels: {
                backgroundColor: (ctx: any) => {
                    return "black";
                },
                formatter: (val: number, ctx: any) => {
                    return val + "%";
                },
                anchor: "center",
                borderRadius: 4,
                color: "white",
                font: {
                    size: 12,
                    weight: "bold",
                },
                padding: 6,
            },
            legend: {
                events: [],
                display: true,
                position: "left",
            },
        },
    };

    return (
        <Doughnut
            plugins={[ChartDataLabels]}
            data={data}
            options={options as any}
        />
    );
};

export default CharacterFrequency;
