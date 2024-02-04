import "chart.js/auto";
import { Doughnut } from "react-chartjs-2";
import { getRandomColors, Quantity } from "@src/lib/editor/statistics";
import { Project } from "@src/lib/utils/types";

type Props = {
    project: Project;
    color: string;
    quantity: Quantity;
};

const CharacterQuantity = ({ color, quantity }: Props) => {
    const labels = Object.keys(quantity);

    const data = {
        labels: labels,
        datasets: [
            {
                backgroundColor: getRandomColors(labels.length, 0.9, 0.75),
                borderColor: color,
                data: Object.values(quantity),
            },
        ],
    };

    const options = {
        aspectRatio: 1.6,
        hoverOffset: 12,
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

    return <Doughnut data={data} options={options as any} />;
};

export default CharacterQuantity;
