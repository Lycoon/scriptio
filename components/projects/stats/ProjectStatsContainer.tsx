import { Project } from "@prisma/client";

import "chart.js/auto";
import { Doughnut } from "react-chartjs-2";
import {
  getCharacterFrequency,
  getRandomColor,
  getRandomColors,
} from "../../../src/lib/statistics";

type Props = {
  project: Project;
};

const ProjectStatsContainer = ({ project }: Props) => {
  const frequency = getCharacterFrequency(project.screenplay);
  const labels = Array.from(frequency.keys());
  const data = {
    labels: labels,
    datasets: [
      {
        label: "Character frequency",
        backgroundColor: getRandomColors(labels.length, Math.random(), 0.32),
        borderColor: "rgb(100, 100, 100)",
        data: Array.from(frequency.values()),
      },
    ],
  };

  const options = {
    plugins: {
      legend: {
        display: true,
        position: "right",
      },
    },
  };

  return (
    <div id="project-stats-container">
      <div className="center-column">
        <div className="stats-title">
          <h1 id="project-page-title">Statistics</h1>
          <p className="stats-title-text">{project.title}</p>
        </div>
        <div>
          <Doughnut width={100} height={100} data={data} options={options} />
        </div>
      </div>
    </div>
  );
};

export default ProjectStatsContainer;
