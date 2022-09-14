import { Project } from "../../../pages/api/users";

import "chart.js/auto";
import { Bubble, Doughnut, Line } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import {
    getCharacterDistribution,
    getCharacterFrequency,
    getRandomColors,
} from "../../../src/lib/statistics";
import { useEffect, useState } from "react";

type Props = {
    project: Project;
    color: string;
    pages: number;
};

const CharacterDistribution = ({ project, color, pages }: Props) => {
    //let distribution = getCharacterDistribution(project.screenplay, pages);
    const labels: number[] = new Array(pages).fill(0);;
    
    let distribution: { [actor: string]: { [pageNumber: number]: number } } = {}
    distribution["Hugo"] = {5: 60, 6: 41, 12: 35, 17: 80};
    distribution["Axel"] = {1: 15, 11: 110, 29: 55, 37: 21, 69: 21, 110: 21, 113: 21, 115: 21};
    distribution["Emma"] = {87: 41, 91: 20, 110: 20};

    const datasets = [];
    for (const label in distribution) {
        const distr: { [pageNumber: number]: number } = distribution[label];
        let data: any[] = [];

        for (const pageNumber in distr) {
            data.push({x: pageNumber, y: distr[pageNumber], r: 5});
        }

        datasets.push({
            label,
            data,
            fill: false,
            borderColor: 'rgb(' + Math.random() * 255 + ', ' + Math.random() * 255 +', ' + Math.random() * 255 +')',
            tension: 0.1
          })
    }

    const data = {
        labels,
        datasets
    };

    const options = {
        aspectRatio: 1.4,
        layout: {
            padding: 50,
        },
        plugins: {
            legend: {
                events: [],
                display: true,
                position: "bottom",
            },
        },
    };

    return (
        <Bubble
            data={data}
            options={options as any}
        />
    );
};

export default CharacterDistribution;
