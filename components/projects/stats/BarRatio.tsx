import "chart.js/auto";
import { Bar } from "react-chartjs-2";
import { getRandomColors, StatsRatio } from "@src/lib/statistics";
import { Project } from "@src/lib/utils/types";

type Props = {
    project: Project;
    color: string;
    ratio: StatsRatio;
};

const BarRatio = ({ color, ratio }: Props) => {
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
            padding: { right: 50 },
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
