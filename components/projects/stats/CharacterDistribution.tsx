import "chart.js/auto";
import { Line } from "react-chartjs-2";
import {
    Distribution,
    Frequency,
    getRandomColors,
    getScaledDistribution,
} from "../../../src/lib/statistics";
import { Project } from "../../../src/lib/utils/types";

type Props = {
    project: Project;
    color: string;
    distribution: Distribution;
    frequency: Frequency;
};

const CharacterDistribution = ({ distribution }: Props) => {
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

    return <Line data={data} options={options as any} />;
};

export default CharacterDistribution;
