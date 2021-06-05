using System;

namespace HelloWorld
{
    public class Program
    {
        private static void WriteToConsole(string text) {
            Console.WriteLine(text);
        }
        private static void SayHelloWorld() {
            string text = "Hello World!";
            WriteToConsole(text);
        }
        /// <summary>
        ///  This class is a demo for CodeTalk with C#.
        /// </summary>
        public static void Main(string[] args)
        {
            SayHelloWorld();
        }
    }
}