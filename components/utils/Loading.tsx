import load from "./Loading.module.css";

import LoadingSVG from "@public/images/loading.svg";

const Loading = () => (
    <div className={load.container}>
        <LoadingSVG className={load.img} />
    </div>
);

export default Loading;
