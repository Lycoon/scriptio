import { useEffect } from "react";
import Router from "next/router";
import useSWR from "swr";
import type { User } from "../../pages/api/users";

export default function useUser({
  redirectTo = "",
  redirectIfFound = true,
} = {}) {
  const { data: user, mutate: setUser } = useSWR<User>("/api/users/");

  useEffect(() => {
    if (!redirectTo || !user) return;

    if (
      (redirectTo && !redirectIfFound && !user?.isLoggedIn) ||
      (redirectIfFound && user?.isLoggedIn)
    ) {
      Router.push(redirectTo);
    }
  }, [user, redirectIfFound, redirectTo]);

  return { user, setUser };
}
