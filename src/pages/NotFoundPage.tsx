import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-screen w-screen items-center justify-center">
      <h1 className="text-4xl font-bold">404 Not Found</h1>
      <p className="text-lg">The page you are looking for does not exist.</p>
      <Button className="mt-4 cursor-pointer" onClick={() => navigate("/")}>
        Go to Home
      </Button>
    </div>
  );
};

export default NotFoundPage;
