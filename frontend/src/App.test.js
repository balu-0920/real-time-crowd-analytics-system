// import { render, screen } from '@testing-library/react';
// import App from './App';

// test('renders learn react link', () => {
//   render(<App />);
//   const linkElement = screen.getByText(/learn react/i);
//   expect(linkElement).toBeInTheDocument();
// });


import { render, screen } from "@testing-library/react";
import App from "./App";

// Mock socket.io-client to avoid real connections in tests
jest.mock("socket.io-client", () => {
  const on = jest.fn();
  const off = jest.fn();
  return { io: () => ({ on, off }) };
});

test("renders the dashboard title", () => {
  render(<App />);
  expect(screen.getByText(/Crowd Monitoring Dashboard/i)).toBeInTheDocument();
});

test("renders nav tabs", () => {
  render(<App />);
  expect(screen.getByText(/Live/i)).toBeInTheDocument();
  expect(screen.getByText(/History/i)).toBeInTheDocument();
  expect(screen.getByText(/Settings/i)).toBeInTheDocument();
});