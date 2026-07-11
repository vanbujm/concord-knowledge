const Home = () => {
  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        Concord LARP
      </p>

      <h1 className="text-4xl font-semibold tracking-tight text-foreground">
        Concord Wiki Search
      </h1>

      <p className="max-w-md text-lg text-muted-foreground">
        Fast, cited search across the Concord wiki. Web and MCP, coming soon.
      </p>
    </main>
  );
};

export default Home;
