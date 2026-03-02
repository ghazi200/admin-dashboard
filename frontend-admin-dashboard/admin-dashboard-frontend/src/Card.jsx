export default function Card({ title, description }) {
  return (
    <div className="bg-white p-4 rounded shadow">
      <h2 className="font-bold text-lg">{title}</h2>
      <p>{description}</p>
    </div>
  );
}
