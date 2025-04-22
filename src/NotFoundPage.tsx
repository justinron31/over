import { Link } from "react-router-dom";
import { Button } from "./components/ui/button";

const NotFoundPage = () => {
  return (
    <div className="flex flex-col h-screen w-screen items-center justify-center">
      <h1 className="text-4xl font-bold">404 Not Found</h1>
      <p className="text-lg">The page you are looking for does not exist.</p>
      <Link to="/">
        <Button className="mt-4 cursor-pointer">
          Go back to the home page
        </Button>
      </Link>
    </div>
  );
};

export default NotFoundPage;
