import { useEffect } from "react";
import useSWR from "swr";
import type { CookieUser } from "../../pages/api/users";

export default function useUser({
    redirectTo = "/",
    redirectIfFound = true,
} = {}) {
    const { data: user, mutate: setUser } = useSWR<CookieUser>("/api/users/");

    useEffect(() => {
        if (!redirectTo || !user) return;

        // if (
        //   (redirectTo && !redirectIfFound && !user?.isLoggedIn) ||
        //   (redirectIfFound && user?.isLoggedIn)
        // ) {
        //   Router.push(redirectTo);
        // }
    }, [user, redirectIfFound, redirectTo]);

    return { user, setUser };
}
